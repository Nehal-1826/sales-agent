/**
 * Demo data for Pro Workspace picker.
 */
import type { LucideIcon } from 'lucide-react';
import { CreditCard, Key, Settings2, Shield, Users, Webhook } from 'lucide-react';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type Status = 'active' | 'invited' | 'paused';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar: string;          // 2-letter avatar
  hue: number;             // 0-360 for gradient
  status: Status;
  lastSeenRel: string;
  mailboxAssigned?: string;
}

export const TEAM: TeamMember[] = [
  { id: 'tm1', name: 'Alex Chen',   email: 'alex@acme.com',   role: 'owner',  avatar: 'AC', hue: 260, status: 'active',  lastSeenRel: 'Active now',     mailboxAssigned: 'alex@acme.com' },
  { id: 'tm2', name: 'Bryan Lee',   email: 'bryan@acme.com',  role: 'admin',  avatar: 'BL', hue: 200, status: 'active',  lastSeenRel: '12m ago',        mailboxAssigned: 'bryan@acme.com' },
  { id: 'tm3', name: 'Casey Park',  email: 'casey@acme.com',  role: 'admin',  avatar: 'CP', hue: 150, status: 'active',  lastSeenRel: '1h ago',         mailboxAssigned: 'casey@acme.com' },
  { id: 'tm4', name: 'Dana Reyes',  email: 'dana@acme.com',   role: 'member', avatar: 'DR', hue: 50,  status: 'paused',  lastSeenRel: '4d ago',         mailboxAssigned: 'dana@acme.com' },
  { id: 'tm5', name: 'Eli Singh',   email: 'eli@acme.com',    role: 'member', avatar: 'ES', hue: 340, status: 'active',  lastSeenRel: '36m ago',        mailboxAssigned: 'eli@acme.com' },
  { id: 'tm6', name: 'Farah Ito',   email: 'farah@acme.com',  role: 'viewer', avatar: 'FI', hue: 110, status: 'invited', lastSeenRel: 'Pending invite' },
];

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdRel: string;
  lastUsedRel: string;
  status: 'active' | 'revoked';
}

export const API_KEYS: ApiKey[] = [
  { id: 'k1', name: 'Production',   prefix: 'wp_live_8f3a…', createdRel: '3m ago',  lastUsedRel: '12m ago', status: 'active' },
  { id: 'k2', name: 'Staging CI',   prefix: 'wp_live_2d1b…', createdRel: '14d ago', lastUsedRel: '2h ago',  status: 'active' },
  { id: 'k3', name: 'Zapier',       prefix: 'wp_live_a907…', createdRel: '32d ago', lastUsedRel: '1d ago',  status: 'active' },
  { id: 'k4', name: 'Old laptop',   prefix: 'wp_live_c451…', createdRel: '90d ago', lastUsedRel: '45d ago', status: 'revoked' },
];

export interface WebhookHook {
  id: string;
  url: string;
  events: number;
  failures: number;
  lastDeliveryRel: string;
  status: 'active' | 'paused';
}

export const WEBHOOKS: WebhookHook[] = [
  { id: 'wh1', url: 'https://acme.com/webhooks/warmpulse', events: 824, failures: 0,  lastDeliveryRel: '4m ago',  status: 'active' },
  { id: 'wh2', url: 'https://hooks.slack.com/services/T0/B0/…', events: 142, failures: 2, lastDeliveryRel: '18m ago', status: 'active' },
];

export interface AuditEvent {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target: string;
  tone: 'info' | 'warn' | 'danger' | 'success';
}

function daysAgo(d: number): string {
  const t = new Date();
  t.setDate(t.getDate() - d);
  return t.toISOString();
}

export const AUDIT: AuditEvent[] = [
  { id: 'a1',  ts: daysAgo(0),  actor: 'alex@acme.com',  action: 'Generated report',          target: 'Warmth · weekly digest',     tone: 'info' },
  { id: 'a2',  ts: daysAgo(0),  actor: 'casey@acme.com', action: 'Updated DNS for',           target: 'casey@acme.com',             tone: 'success' },
  { id: 'a3',  ts: daysAgo(0),  actor: 'bryan@acme.com', action: 'Created API key',           target: 'Production',                 tone: 'info' },
  { id: 'a4',  ts: daysAgo(1),  actor: 'alex@acme.com',  action: 'Invited',                   target: 'farah@acme.com',             tone: 'success' },
  { id: 'a5',  ts: daysAgo(1),  actor: 'system',         action: 'Paused mailbox',            target: 'dana@acme.com',              tone: 'warn' },
  { id: 'a6',  ts: daysAgo(2),  actor: 'alex@acme.com',  action: 'Upgraded plan to',          target: 'Pro · annual',               tone: 'success' },
  { id: 'a7',  ts: daysAgo(3),  actor: 'casey@acme.com', action: 'Added webhook',             target: 'hooks.slack.com',            tone: 'info' },
  { id: 'a8',  ts: daysAgo(4),  actor: 'alex@acme.com',  action: 'Connected mailbox',         target: 'eli@acme.com',               tone: 'success' },
  { id: 'a9',  ts: daysAgo(7),  actor: 'system',         action: 'Bounce spike detected on',  target: 'dana@acme.com',              tone: 'danger' },
  { id: 'a10', ts: daysAgo(14), actor: 'alex@acme.com',  action: 'Created workspace',         target: 'Acme · WarmPulse Pro',       tone: 'success' },
];

export interface PlanRow {
  name: string;
  price: string;
  mailboxes: string;
  members: string;
  apiKeys: string;
  current: boolean;
}

export const PLAN_ROWS: PlanRow[] = [
  { name: 'Starter', price: '₹1,500/mo',  mailboxes: '1',        members: '1',        apiKeys: '—',     current: false },
  { name: 'Pro',     price: '₹5,000/mo',  mailboxes: '5',        members: '10',       apiKeys: '5',     current: true  },
  { name: 'Agency',  price: '₹12,000/mo', mailboxes: 'Unlimited',members: 'Unlimited',apiKeys: 'Unlimited', current: false },
];

export interface SettingsSection {
  key: string;
  name: string;
  desc: string;
  Icon: LucideIcon;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'profile',  name: 'Workspace profile',  desc: 'Name, slug, brand color, timezone',           Icon: Settings2 },
  { key: 'team',     name: 'Team & roles',       desc: 'Members, invites, permission groups',         Icon: Users },
  { key: 'plan',     name: 'Plan & billing',     desc: 'Current plan, invoices, payment method',      Icon: CreditCard },
  { key: 'api',      name: 'API keys',           desc: 'Programmatic warmup control · 4 active',      Icon: Key },
  { key: 'webhooks', name: 'Webhooks',           desc: '2 active · last delivery 4m ago',             Icon: Webhook },
  { key: 'security', name: 'Security',           desc: 'SSO, 2FA, IP allow-list, audit log',          Icon: Shield },
];

export function relTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const HUE_BG = (hue: number): string =>
  `linear-gradient(135deg, hsl(${hue}, 75%, 60%), hsl(${(hue + 40) % 360}, 75%, 50%))`;
