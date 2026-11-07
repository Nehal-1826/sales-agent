/**
 * REAL customer proof — case studies and testimonials.
 *
 * Ships EMPTY on purpose. The <Proof /> section renders nothing while both
 * arrays are empty. NEVER add invented customers, logos, quotes, ratings or
 * numbers here — only results a real customer has agreed in writing to share.
 *
 * How to add one:
 *   1. Get written permission from the customer (an email is fine) to publish
 *      their name, company and numbers. Keep that email.
 *   2. Append an object to CASE_STUDIES, for example:
 *        {
 *          company: 'Company name as they want it shown',
 *          city: 'Coimbatore',
 *          industry: 'Web design agency',
 *          summary: 'One or two plain sentences on what they did.',
 *          results: ['412 audited leads', '19 positive replies', '4 new clients'],
 *          period: 'Oct 2026',
 *        }
 *   3. Testimonials: the quote must be the customer's own words, unedited.
 *   4. Run `npm run build` — the section then appears on / and /pricing.
 */

export interface CaseStudy {
  company: string;
  city: string;
  industry: string;
  summary: string;
  /** short, verifiable outcomes, e.g. "19 positive replies" */
  results: string[];
  /** when the results were measured, e.g. "Oct 2026" */
  period: string;
}

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
}

export const CASE_STUDIES: CaseStudy[] = [];

export const TESTIMONIALS: Testimonial[] = [];
