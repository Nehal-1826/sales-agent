/**
 * Pricing plans — single source for the pricing page AND the
 * SoftwareApplication JSON-LD offers. Static fallback that mirrors the
 * seeded billing plans; the pricing page overlays live /api/billing/plans/.
 * Amounts are whole currency units (₹ / $), not minor units.
 */
export type PlanCode = 'startups' | 'business' | 'enterprise';
export type Interval = 'month' | 'year';
export type Currency = 'INR' | 'USD';

export interface Tier {
  id: PlanCode;
  name: string;
  /** monthly / yearly price in ₹ */
  inr: number;
  inrYear: number;
  /** monthly / yearly price in $ */
  usd: number;
  usdYear: number;
  blurb: string;
  features: string[];
  popular?: boolean;
}

export const TIERS: Tier[] = [
  {
    id: 'startups',
    name: 'Startups',
    inr: 2999,
    inrYear: 29990,
    usd: 39,
    usdYear: 390,
    blurb: 'For a founder or small team starting outreach.',
    features: [
      '500 new leads / month',
      '3,000 emails / month',
      '2 mailboxes, 2 team seats',
      '5 follow-up sequences',
      '2 automatic runs a day',
      '300 assistant messages / month',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    inr: 7999,
    inrYear: 79990,
    usd: 99,
    usdYear: 990,
    popular: true,
    blurb: 'For a sales team or agency running real volume.',
    features: [
      '2,000 new leads / month',
      '15,000 emails / month',
      '5 mailboxes, 5 team seats',
      '25 follow-up sequences',
      'WhatsApp drafts (you approve each one)',
      '6 automatic runs a day',
      '2,000 assistant messages / month',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    inr: 19999,
    inrYear: 199990,
    usd: 249,
    usdYear: 2490,
    blurb: 'For agencies and large teams.',
    features: [
      '8,000 new leads / month',
      '60,000 emails / month',
      '20 mailboxes, 20 team seats',
      'Unlimited follow-up sequences',
      'WhatsApp drafts (you approve each one)',
      '24 automatic runs a day',
      '10,000 assistant messages / month',
    ],
  },
];

const inrFmt = new Intl.NumberFormat('en-IN');
const usdFmt = new Intl.NumberFormat('en-US');

export const formatInr = (n: number) => `₹${inrFmt.format(n)}`;
export const formatUsd = (n: number) => `$${usdFmt.format(n)}`;
export const formatMoney = (n: number, c: Currency) => (c === 'INR' ? formatInr(n) : formatUsd(n));

/** Currency default: Asia/Kolkata → INR, else USD. Safe during prerender (falls back to INR, the India-first default). */
export function detectCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return 'INR';
    return tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta' ? 'INR' : 'USD';
  } catch {
    return 'INR';
  }
}

/** Signup URL for a plan CTA. */
export const signupHref = (code: string, interval: Interval) =>
  `/?signup=1&plan=${encodeURIComponent(code)}&interval=${interval}`;

export const BONUS_DAYS = 10;
export const REFUND_WINDOW_DAYS = 10;

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
    q: 'Do I need a contract?',
    a: 'No contract. You sign up and pay online, monthly or yearly. Cancel within 10 days of your first payment for a partial refund, or any time after to stop at the end of the period.',
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
    q: 'What are the 10 bonus days?',
    a: 'Your first billing period is extended by 10 days at no charge, so you get more than a full period for your first payment.',
  },
  {
    q: 'What is the refund policy?',
    a: 'Cancel within 10 days of your first payment and we refund the unused part of the period you paid for, minus a small non-refundable fee. After 10 days, cancelling stops renewal at the end of the period and there is no refund.',
  },
];
