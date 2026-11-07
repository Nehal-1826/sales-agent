/**
 * Pricing tiers — single source for the pricing page AND the
 * SoftwareApplication JSON-LD offers. Monthly prices; yearly = 20% off.
 * No payment integration: every CTA books a demo.
 */
export interface Tier {
  id: 'free' | 'starter' | 'growth' | 'agency';
  name: string;
  inr: number;
  usd: number;
  blurb: string;
  features: string[];
  popular?: boolean;
}

export const ANNUAL_DISCOUNT = 0.2;

export const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free',
    inr: 0,
    usd: 0,
    blurb: 'Try it on one market.',
    features: ['25 audited leads / month', '1 city × industry', 'Copy-paste email drafts'],
  },
  {
    id: 'starter',
    name: 'Starter',
    inr: 2499,
    usd: 29,
    blurb: 'For a solo founder or freelancer.',
    features: [
      '300 audited leads / month',
      '1 workspace',
      '1 mailbox',
      'Approve & send from your own mailbox',
      'Daily 8 PM IST report',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    inr: 6999,
    usd: 79,
    popular: true,
    blurb: 'For a small agency or sales team.',
    features: [
      '1,500 audited leads / month',
      '3 workspaces',
      '3 mailboxes',
      'Autopilot: finds and drafts on a schedule (you still approve)',
      'Phone number enrichment',
      'WarmPulse mailbox warmup included (coming soon)',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    inr: 14999,
    usd: 199,
    blurb: 'For agencies running many clients.',
    features: [
      '5,000 audited leads / month',
      '10 workspaces',
      'Unlimited mailboxes',
      'White-label audit reports',
      'Priority support',
    ],
  },
];

const inrFmt = new Intl.NumberFormat('en-IN');
const usdFmt = new Intl.NumberFormat('en-US');

/** Per-month price for the chosen billing period. */
export function monthly(amount: number, annual: boolean): number {
  return annual ? Math.round(amount * (1 - ANNUAL_DISCOUNT)) : amount;
}

export const formatInr = (n: number) => `₹${inrFmt.format(n)}`;
export const formatUsd = (n: number) => `$${usdFmt.format(n)}`;

export const PILOT = { inr: 2999, days: 14 };

/** The tool stack Shailog AI replaces — approximate entry-level list prices (USD / month). */
export const STACK = [
  { tool: 'Apollo', job: 'contact data', usd: 59 },
  { tool: 'Clay', job: 'enrichment and research', usd: 149 },
  { tool: 'ChatGPT', job: 'writing the email', usd: 20 },
  { tool: 'Instantly', job: 'sending and warmup', usd: 37 },
];
export const STACK_TOTAL_USD = STACK.reduce((s, x) => s + x.usd, 0);

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Do I need a contract or a credit card?',
    a: 'No. Plans are monthly and you can stop any time. The Free plan needs no card. Right now we set up every paid account personally after a short demo call.',
  },
  {
    q: 'Does Shailog AI send emails on its own?',
    a: 'No. It finds the business, audits the website and writes a draft. Nothing is sent until you press Approve. Autopilot only means it finds and drafts on a schedule.',
  },
  {
    q: 'Which mailbox do the emails come from?',
    a: 'Your own mailbox and your own domain. Replies land in your normal inbox. Shailog AI does not reply to prospects for you.',
  },
  {
    q: 'What is an "audited lead"?',
    a: 'A real business whose website our AI has read and scored 0–100 for how much it could gain (speed, mobile, SEO, contact options, content). Directories and competitors are rejected and do not count.',
  },
  {
    q: 'Which countries does it cover?',
    a: 'Any city worldwide. It is tuned first for Indian metros such as Chennai, Bengaluru, Mumbai, Delhi and Hyderabad.',
  },
  {
    q: 'How do you handle unsubscribes and privacy laws?',
    a: 'Every email carries a one-click unsubscribe link and unsubscribe headers. Anyone who unsubscribes goes on a suppression list and is never emailed again from your workspace. Our Privacy Policy covers the DPDP Act 2023 and GDPR.',
  },
  {
    q: 'What does the ₹2,999 pilot include?',
    a: '14 days set up for your market by us. If you do not get 5 positive replies or 2 booked calls, we refund the ₹2,999.',
  },
  {
    q: 'What does "founding customer" mean?',
    a: 'The first 25 agencies that sign up keep the price they joined at for as long as they stay subscribed, even if list prices go up later.',
  },
];
