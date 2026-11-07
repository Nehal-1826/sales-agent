/**
 * Build-time prerender for the public marketing site.
 *
 * Runs after:
 *   vite build                                   → dist/ (client bundle + dist/index.html template)
 *   vite build --ssr src/entry-server.tsx --outDir dist-ssr
 *
 * For every public route it renders the React page to HTML with
 * react-dom/server, injects it into #root plus per-route <head> tags
 * (title, description, canonical, OG/Twitter, JSON-LD) and writes
 *   /            → dist/index.html
 *   /pricing     → dist/pricing/index.html   (etc.)
 * then writes dist/sitemap.xml. The browser bundle mounts with createRoot and
 * re-renders the same markup, so no hydration mismatch is possible.
 *
 * nginx's `try_files $uri $uri/ /index.html` serves dist/pricing/index.html
 * for /pricing and the real sitemap.xml / robots.txt files.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const ssrDir = join(root, 'dist-ssr');

const entry = pathToFileURL(join(ssrDir, 'entry-server.js')).href;
const { render, ROUTES, canonical, SITE_URL } = await import(entry);

const template = await readFile(join(dist, 'index.html'), 'utf8');
if (!template.includes('<div id="root"></div>')) {
  throw new Error('prerender: dist/index.html has no empty <div id="root"></div>');
}
if (!template.includes('<!--app-head-->')) {
  throw new Error('prerender: dist/index.html is missing the <!--app-head--> marker');
}
// the default <title> in index.html is replaced by the route's own title
const baseTemplate = template.replace(/<title>[\s\S]*?<\/title>\s*/, '');

for (const route of ROUTES) {
  const { html, head } = render(route.path);
  const page = baseTemplate
    .replace('<!--app-head-->', head)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`);
  const outFile = route.path === '/' ? join(dist, 'index.html') : join(dist, route.path.slice(1), 'index.html');
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, page, 'utf8');
  console.log(`prerender: ${route.path.padEnd(36)} → ${outFile.slice(root.length + 1)} (${page.length} bytes)`);
}

const today = new Date().toISOString().slice(0, 10);
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  ROUTES.map(
    (r) =>
      `  <url><loc>${canonical(r.path)}</loc><lastmod>${today}</lastmod><priority>${r.priority.toFixed(1)}</priority></url>`,
  ).join('\n') +
  '\n</urlset>\n';
await writeFile(join(dist, 'sitemap.xml'), sitemap, 'utf8');
console.log(`prerender: sitemap.xml with ${ROUTES.length} URLs`);

// robots.txt with the sitemap line for the configured origin (overrides public/robots.txt)
await writeFile(
  join(dist, 'robots.txt'),
  `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

Sitemap: ${SITE_URL}/sitemap.xml
`,
  'utf8',
);

// the SSR bundle is a build artefact only — never deployed
await rm(ssrDir, { recursive: true, force: true });
