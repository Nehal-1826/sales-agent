/**
 * SEO — per-route <head> tags and JSON-LD, shared by the build-time
 * prerender (scripts/prerender.mjs, via src/entry-server.tsx) and the client
 * (useDocumentMeta keeps title/description right in `npm run dev`).
 */
import { useEffect } from 'react';
import { COMPANY, SITE_URL, canonical, routeMeta } from './site';
import { FAQ, TIERS } from './pricing';

type Json = Record<string, unknown>;

export function organizationLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: COMPANY.name,
    url: COMPANY.website,
    logo: `${SITE_URL}${COMPANY.logo}`,
    email: COMPANY.email,
    telephone: COMPANY.phone,
    address: {
      '@type': 'PostalAddress',
      addressLocality: COMPANY.city,
      addressRegion: COMPANY.region,
      addressCountry: COMPANY.country,
    },
  };
}

export function softwareLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: COMPANY.product,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: `${SITE_URL}/`,
    description:
      'Finds real businesses by industry and city, audits each website with AI, and drafts cold emails citing the specific gaps. Every email is approved by a human and sent from your own mailbox.',
    publisher: { '@type': 'Organization', name: COMPANY.name },
    offers: TIERS.flatMap((t) => [
      {
        '@type': 'Offer',
        name: t.name,
        price: String(t.inr),
        priceCurrency: 'INR',
        url: `${SITE_URL}/pricing`,
      },
      {
        '@type': 'Offer',
        name: t.name,
        price: String(t.usd),
        priceCurrency: 'USD',
        url: `${SITE_URL}/pricing`,
      },
    ]),
  };
}

export function faqLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function jsonLdFor(path: string): Json[] {
  const blocks: Json[] = [organizationLd()];
  if (path === '/' || path === '/pricing') blocks.push(softwareLd());
  if (path === '/pricing') blocks.push(faqLd());
  return blocks;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON safe inside <script>: no "</script>" break-out. */
const safeJson = (o: Json) => JSON.stringify(o).replace(/</g, '\\u003c');

/** Full set of <head> tags for a public route (title included). */
export function headTags(path: string): string {
  const meta = routeMeta(path);
  if (!meta) return '';
  const url = canonical(meta.path);
  const image = `${SITE_URL}${COMPANY.logo}`;
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(COMPANY.product)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    ...jsonLdFor(meta.path).map((b) => `<script type="application/ld+json">${safeJson(b)}</script>`),
  ];
  return tags.join('\n    ');
}

/** Client-side: keep <title> and description in sync (dev server, no prerender). */
export function useDocumentMeta(path: string): void {
  useEffect(() => {
    const meta = routeMeta(path);
    if (!meta) return;
    document.title = meta.title;
    let desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!desc) {
      desc = document.createElement('meta');
      desc.name = 'description';
      document.head.appendChild(desc);
    }
    desc.content = meta.description;
  }, [path]);
}
