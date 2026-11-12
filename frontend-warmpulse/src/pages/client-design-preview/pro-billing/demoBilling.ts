/**
 * Demo data for Pro Billing picker.
 * Currency: INR. Pro plan = ₹5,000/mo. Mixed history (paid / pending / refunded).
 */

export type InvoiceStatus = 'paid' | 'pending' | 'failed' | 'refunded';
export type PaymentKind = 'card' | 'upi' | 'netbanking';

export interface Invoice {
  id: string;          // "INV-2026-0042"
  date: string;        // ISO date
  amount: number;      // INR rupees (no paise)
  currency: 'INR';
  status: InvoiceStatus;
  period: string;      // "May 2026" or "Apr 2026"
  description: string; // "Pro · monthly · 5 mailboxes"
  paymentKind?: PaymentKind;
  paymentLabel?: string; // "VISA · 4242"
  lineItems: Array<{ label: string; qty: string; amount: number }>;
}

function dateNDaysAgo(d: number): string {
  const t = new Date();
  t.setDate(t.getDate() - d);
  return t.toISOString();
}

export const INVOICES: Invoice[] = [
  {
    id: 'INV-2026-0058',
    date: dateNDaysAgo(2),
    amount: 5000,
    currency: 'INR',
    status: 'pending',
    period: 'May 2026',
    description: 'Pro · monthly · 5 mailboxes',
    paymentKind: 'card',
    paymentLabel: 'VISA · 4242',
    lineItems: [
      { label: 'Pro plan · monthly subscription', qty: '1 mo', amount: 5000 },
      { label: 'Included mailboxes', qty: '5 / 5', amount: 0 },
      { label: 'Included team seats', qty: '6 / 10', amount: 0 },
    ],
  },
  {
    id: 'INV-2026-0047',
    date: dateNDaysAgo(32),
    amount: 5000,
    currency: 'INR',
    status: 'paid',
    period: 'Apr 2026',
    description: 'Pro · monthly · 5 mailboxes',
    paymentKind: 'card',
    paymentLabel: 'VISA · 4242',
    lineItems: [
      { label: 'Pro plan · monthly subscription', qty: '1 mo', amount: 5000 },
      { label: 'Included mailboxes', qty: '5 / 5', amount: 0 },
    ],
  },
  {
    id: 'INV-2026-0034',
    date: dateNDaysAgo(63),
    amount: 5450,
    currency: 'INR',
    status: 'paid',
    period: 'Mar 2026',
    description: 'Pro · monthly + 1 extra mailbox',
    paymentKind: 'card',
    paymentLabel: 'VISA · 4242',
    lineItems: [
      { label: 'Pro plan · monthly subscription', qty: '1 mo', amount: 5000 },
      { label: 'Extra mailbox overage', qty: '1 mailbox', amount: 450 },
    ],
  },
  {
    id: 'INV-2026-0022',
    date: dateNDaysAgo(94),
    amount: 5000,
    currency: 'INR',
    status: 'paid',
    period: 'Feb 2026',
    description: 'Pro · monthly · 5 mailboxes',
    paymentKind: 'upi',
    paymentLabel: 'UPI · alex@okhdfc',
    lineItems: [{ label: 'Pro plan · monthly subscription', qty: '1 mo', amount: 5000 }],
  },
  {
    id: 'INV-2026-0010',
    date: dateNDaysAgo(124),
    amount: 5000,
    currency: 'INR',
    status: 'paid',
    period: 'Jan 2026',
    description: 'Pro · monthly · 5 mailboxes',
    paymentKind: 'upi',
    paymentLabel: 'UPI · alex@okhdfc',
    lineItems: [{ label: 'Pro plan · monthly subscription', qty: '1 mo', amount: 5000 }],
  },
  {
    id: 'INV-2025-0287',
    date: dateNDaysAgo(155),
    amount: 5200,
    currency: 'INR',
    status: 'refunded',
    period: 'Dec 2025',
    description: 'Pro · monthly + duplicate charge',
    paymentKind: 'card',
    paymentLabel: 'VISA · 4242',
    lineItems: [
      { label: 'Pro plan · monthly subscription', qty: '1 mo', amount: 5000 },
      { label: 'Refund · duplicate charge', qty: '1', amount: -5200 },
    ],
  },
  {
    id: 'INV-2025-0263',
    date: dateNDaysAgo(186),
    amount: 5000,
    currency: 'INR',
    status: 'paid',
    period: 'Nov 2025',
    description: 'Pro · monthly · 5 mailboxes',
    paymentKind: 'card',
    paymentLabel: 'VISA · 4242',
    lineItems: [{ label: 'Pro plan · monthly subscription', qty: '1 mo', amount: 5000 }],
  },
  {
    id: 'INV-2025-0245',
    date: dateNDaysAgo(217),
    amount: 1500,
    currency: 'INR',
    status: 'paid',
    period: 'Oct 2025',
    description: 'Upgraded · Starter → Pro · prorated',
    paymentKind: 'card',
    paymentLabel: 'VISA · 4242',
    lineItems: [
      { label: 'Starter → Pro upgrade', qty: 'prorated', amount: 3500 },
      { label: 'Credit · Starter unused days', qty: '12 days', amount: -2000 },
    ],
  },
];

export interface PaymentMethod {
  id: string;
  kind: PaymentKind;
  label: string;
  sub: string;
  isDefault: boolean;
  isBackup?: boolean;
  expiry?: string;     // for cards
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm1', kind: 'card', label: 'VISA · 4242',          sub: 'Alex Chen',     isDefault: true,  expiry: '09 / 28' },
  { id: 'pm2', kind: 'upi',  label: 'UPI · alex@okhdfc',    sub: 'HDFC Bank',     isDefault: false, isBackup: true },
  { id: 'pm3', kind: 'card', label: 'Mastercard · 5817',    sub: 'Acme Corp',     isDefault: false, expiry: '03 / 27' },
];

export interface PlanTier {
  key: 'starter' | 'pro' | 'agency';
  name: string;
  price: number;       // INR per month
  tagline: string;
  features: Array<{ label: string; included: boolean; highlight?: boolean }>;
  cta: string;
  isCurrent: boolean;
}

export const PLAN_TIERS: PlanTier[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: 1500,
    tagline: 'For solo founders dipping into outbound.',
    isCurrent: false,
    cta: 'Downgrade',
    features: [
      { label: '1 mailbox',                   included: true },
      { label: '1 team seat',                 included: true },
      { label: 'Up to 30 warmup sends / day', included: true },
      { label: 'Basic warmup engine',         included: true },
      { label: '7-day activity history',      included: true },
      { label: 'Email support',               included: true },
      { label: 'API keys & webhooks',         included: false },
      { label: 'White-label reports',         included: false },
      { label: 'Dedicated peer pool',         included: false },
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 5000,
    tagline: 'For agencies & teams running 5 mailboxes.',
    isCurrent: true,
    cta: 'Current plan',
    features: [
      { label: '5 mailboxes',                       included: true, highlight: true },
      { label: '10 team seats',                     included: true, highlight: true },
      { label: 'Up to 50 warmup sends / day / box', included: true },
      { label: 'Reputation-weighted peer pool',     included: true, highlight: true },
      { label: '90-day activity history',           included: true },
      { label: '5 API keys + 5 webhooks',           included: true },
      { label: 'White-label reports',               included: true, highlight: true },
      { label: 'Priority email + chat support',     included: true },
      { label: 'Dedicated peer pool',               included: false },
    ],
  },
  {
    key: 'agency',
    name: 'Agency',
    price: 12000,
    tagline: 'For warmup-as-a-service operators.',
    isCurrent: false,
    cta: 'Upgrade',
    features: [
      { label: 'Unlimited mailboxes',          included: true, highlight: true },
      { label: 'Unlimited team seats',         included: true },
      { label: 'Unlimited warmup sends / day', included: true },
      { label: 'Dedicated peer pool',          included: true, highlight: true },
      { label: '1-year activity history',      included: true },
      { label: 'Unlimited API + webhooks',     included: true },
      { label: 'White-label + custom domain',  included: true, highlight: true },
      { label: 'Phone + Slack-connect support', included: true },
      { label: 'SOC 2 reports',                included: true, highlight: true },
    ],
  },
];

export interface UsageResource {
  key: string;
  label: string;
  used: number;
  total: number;
  unit: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

export const USAGE: UsageResource[] = [
  { key: 'mb',       label: 'Mailboxes',          used: 5,     total: 5,     unit: '',        tone: 'warning' },
  { key: 'seats',    label: 'Team seats',         used: 6,     total: 10,    unit: '',        tone: 'success' },
  { key: 'sends',    label: 'Warmup sends · May', used: 4280,  total: 7500,  unit: '',        tone: 'success' },
  { key: 'storage',  label: 'Log storage',        used: 12.4,  total: 25,    unit: ' GB',     tone: 'success' },
  { key: 'api',      label: 'API keys',           used: 3,     total: 5,     unit: '',        tone: 'success' },
  { key: 'webhooks', label: 'Webhooks',           used: 2,     total: 5,     unit: '',        tone: 'success' },
];

export interface CostCategory {
  key: string;
  label: string;
  amount: number;
  pct: number;
  color: string;      // CSS variable name (admin token)
}

export const COST_BREAKDOWN: CostCategory[] = [
  { key: 'sub',       label: 'Pro subscription',     amount: 5000, pct: 91.7, color: 'var(--wp-accent)' },
  { key: 'ai',        label: 'LLM content overage',  amount: 320,  pct: 5.9,  color: 'var(--wp-accent-2)' },
  { key: 'storage',   label: 'Log storage overage',  amount: 80,   pct: 1.5,  color: 'var(--wp-success)' },
  { key: 'addons',    label: 'White-label add-on',   amount: 50,   pct: 0.9,  color: 'var(--wp-warning)' },
];

export const CURRENT_PERIOD = {
  start: 'May 1, 2026',
  end:   'May 31, 2026',
  daysIn: 14,           // days into period
  daysTotal: 31,
  nextChargeDate: 'Jun 14, 2026',
  projectedAmount: 5450,
};

export const SPENDING_TREND_6MO: Array<{ month: string; amount: number }> = [
  { month: 'Nov', amount: 5000 },
  { month: 'Dec', amount: 5200 },
  { month: 'Jan', amount: 5000 },
  { month: 'Feb', amount: 5000 },
  { month: 'Mar', amount: 5450 },
  { month: 'Apr', amount: 5000 },
];

export const STATUS_META: Record<InvoiceStatus, { label: string; tone: 'success' | 'warn' | 'danger' | 'info' }> = {
  paid:     { label: 'Paid',     tone: 'success' },
  pending:  { label: 'Pending',  tone: 'warn'    },
  failed:   { label: 'Failed',   tone: 'danger'  },
  refunded: { label: 'Refunded', tone: 'info'    },
};

export function formatINR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const days = Math.round(ms / 86_400_000);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const m = Math.round(days / 30);
  return m === 1 ? '1mo ago' : `${m}mo ago`;
}
