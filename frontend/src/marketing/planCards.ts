/**
 * Plan cards as branded SVG data-URI "images" for the DepthCarousel on
 * /pricing (see PricingPage PlanPicker). Data URIs instead of remote URLs so
 * nothing is fetched and the cards render instantly; regenerated from the
 * tier data on every currency/interval toggle so the card prices always match
 * the page's. Pure string building — safe during prerender and testable.
 */
import type { Currency, Tier } from './pricing';
import { formatMoney } from './pricing';

const ACCENT = '#f97316';
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** XML-escape dynamic text before it is embedded in SVG markup. */
const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** 600×800 portrait card for one tier at one currency/interval. */
export function planCardDataUri(t: Tier, currency: Currency, yearly: boolean): string {
  const amount = currency === 'INR' ? (yearly ? t.inrYear : t.inr) : yearly ? t.usdYear : t.usd;
  const priceColor = t.popular ? ACCENT : '#fafaf9';

  // Popular cards carry the accent border + tag; the rest stay muted.
  const border = t.popular
    ? `<rect x="2" y="2" width="596" height="796" rx="28" fill="url(#bg)" stroke="${ACCENT}" stroke-width="4"/>`
    : `<rect x="1" y="1" width="598" height="798" rx="28" fill="url(#bg)" stroke="#57534e" stroke-width="2"/>`;

  const tag = t.popular
    ? `<rect x="356" y="46" width="196" height="36" rx="18" fill="${ACCENT}"/>` +
      `<text x="454" y="70" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="800" letter-spacing="1.5" fill="#ffffff">MOST POPULAR</text>`
    : '';

  const features = t.features
    .slice(0, 4)
    .map(
      (f, i) =>
        `<text x="48" y="${356 + i * 56}" font-family="${FONT}" font-size="20" fill="${ACCENT}" font-weight="700">\u2713</text>` +
        `<text x="76" y="${356 + i * 56}" font-family="${FONT}" font-size="20" fill="#d6d3d1">${esc(f)}</text>`
    )
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#141210"/><stop offset="1" stop-color="#1c1917"/>` +
    `</linearGradient></defs>` +
    border +
    tag +
    `<text x="48" y="112" font-family="${FONT}" font-size="44" font-weight="700" fill="#fafaf9">${esc(t.name)}</text>` +
    `<text x="48" y="210" font-family="${FONT}" font-size="64" font-weight="800" fill="${priceColor}">${esc(formatMoney(amount, currency))}</text>` +
    `<text x="48" y="252" font-family="${FONT}" font-size="24" fill="#a8a29e">/${yearly ? 'year' : 'month'}</text>` +
    `<line x1="48" y1="292" x2="552" y2="292" stroke="#292524" stroke-width="2"/>` +
    features +
    `<circle cx="56" cy="742" r="8" fill="${ACCENT}"/>` +
    `<text x="74" y="750" font-family="${FONT}" font-size="20" font-weight="600" fill="#d6d3d1">WarmPulse</text>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
