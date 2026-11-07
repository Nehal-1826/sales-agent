/**
 * SSR entry used ONLY at build time by scripts/prerender.mjs
 * (`vite build --ssr src/entry-server.tsx`). Renders a public route to an
 * HTML string plus its <head> tags. Never shipped to the browser.
 */
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { MarketingPage } from './marketing/MarketingSite';
import { ROUTES, SITE_URL, canonical } from './marketing/site';
import { headTags } from './marketing/seo';

export { ROUTES, SITE_URL, canonical };

export function render(path: string): { html: string; head: string } {
  const meta = ROUTES.find((r) => r.path === path);
  if (!meta) throw new Error(`Not a public route: ${path}`);
  const html = renderToString(
    <StrictMode>
      {/* "/" gets a Sign in button on the client; the static HTML links to /?signin=1 */}
      <MarketingPage path={meta.path} />
    </StrictMode>,
  );
  return { html, head: headTags(meta.path) };
}
