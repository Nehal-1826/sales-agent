/**
 * Public marketing site — routes, per-page SEO metadata and company facts.
 * These are REAL path routes (/pricing, /privacy …), prerendered to static
 * HTML at build time by scripts/prerender.mjs. The logged-in app keeps its
 * hash router (#/leads …) and is untouched.
 */

/** Canonical origin, no trailing slash. Override with VITE_PUBLIC_SITE_URL. */
export const SITE_URL: string = (import.meta.env.VITE_PUBLIC_SITE_URL || 'https://agent.warmpulse.tech').replace(
  /\/+$/,
  '',
);

export const COMPANY = {
  name: 'Shailog Technologies',
  product: 'Shailog AI',
  tagline: 'Find the Lead. Spot the Gap. Win the Deal.',
  email: 'shailog@gmail.com',
  phone: '+91 70106 63166',
  phoneHref: 'tel:+917010663166',
  website: 'https://shailog.com',
  city: 'Salem',
  region: 'Tamil Nadu',
  country: 'IN',
  logo: '/shailog-logo.png',
} as const;

export const LAST_UPDATED = '2026-11-06';

export type MarketingPath =
  | '/'
  | '/pricing'
  | '/how-it-works'
  | '/compare/apollo-alternative'
  | '/compare/leadsgorilla-alternative'
  | '/privacy'
  | '/terms';

export interface RouteMeta {
  path: MarketingPath;
  title: string;
  description: string;
  /** sitemap priority */
  priority: number;
}

export const ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: 'Shailog AI — Find leads, audit their website, send cold emails you approve',
    description:
      'Shailog AI finds real businesses by industry and city, audits each website with AI, and drafts cold emails that cite the exact gaps. You approve every email; it sends from your own mailbox.',
    priority: 1.0,
  },
  {
    path: '/pricing',
    title: 'Pricing — Shailog AI lead finder and website-gap outreach',
    description:
      'Simple monthly plans in INR and USD: Free, Starter ₹2,499, Growth ₹6,999, Agency ₹14,999. 20% off yearly. Founding customers keep their price for life.',
    priority: 0.9,
  },
  {
    path: '/how-it-works',
    title: 'How Shailog AI works — search, audit, enrich, draft, you approve',
    description:
      'Step by step: how Shailog AI finds businesses, reads their website, scores the gap 0–100, finds contact details and drafts an email that you approve before anything sends.',
    priority: 0.8,
  },
  {
    path: '/compare/apollo-alternative',
    title: 'Shailog AI vs Apollo — an honest Apollo alternative for agencies',
    description:
      'Apollo is a large B2B contact database. Shailog AI finds local businesses, audits their website and writes the pitch. An honest comparison of when to use which.',
    priority: 0.7,
  },
  {
    path: '/compare/leadsgorilla-alternative',
    title: 'Shailog AI vs LeadsGorilla — an honest LeadsGorilla alternative',
    description:
      'Both find local businesses with weak websites. Shailog AI adds an AI website audit per lead, drafts emails citing the real flaws, and sends only after you approve. Honest comparison.',
    priority: 0.7,
  },
  {
    path: '/privacy',
    title: 'Privacy Policy — Shailog AI',
    description:
      'How Shailog Technologies handles personal data in Shailog AI: DPDP Act 2023, GDPR legitimate interest, unsubscribe and suppression on every email.',
    priority: 0.3,
  },
  {
    path: '/terms',
    title: 'Terms of Service — Shailog AI',
    description:
      'Terms of Service for Shailog AI by Shailog Technologies, Salem, Tamil Nadu: acceptable use, anti-spam rules (CAN-SPAM), billing and liability.',
    priority: 0.3,
  },
];

export function routeMeta(path: string): RouteMeta | undefined {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return ROUTES.find((r) => r.path === clean);
}

export function canonical(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}
