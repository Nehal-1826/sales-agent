import { useEffect, useState } from 'react';
import type { PageKey } from './types';

/**
 * Path router — /page or /page/sub (e.g. /leads/board, /settings/email).
 * No library: six pages, one optional sub-key. Uses the History API
 * (pushState + popstate) so URLs have no hash fragment. The dev server
 * and the nginx gateway both fall back to /index.html for unknown paths.
 */

const PAGES: PageKey[] = ['home', 'approvals', 'replies', 'tasks', 'leads', 'activity', 'assistant', 'warmup', 'mail', 'settings'];

export interface Route {
  page: PageKey;
  sub: string;
}

export function parseRoute(pathname = window.location.pathname): Route {
  const [page = '', sub = ''] = pathname.replace(/^\//, '').split('/');
  return PAGES.includes(page as PageKey) ? { page: page as PageKey, sub } : { page: 'home', sub: '' };
}

/** A page with unsaved work can veto in-app navigation (returns true = allow). */
const guards = new Set<() => boolean>();

/** Register a guard; returns the function that unregisters exactly this one. */
export function addNavigationGuard(fn: () => boolean): () => void {
  guards.add(fn);
  return () => {
    guards.delete(fn);
  };
}

export function navigate(page: PageKey, sub = ''): void {
  // every dirty form gets a say; stop at the first refusal so the user is asked once
  for (const g of guards) if (!g()) return;
  const next = `/${page}${sub ? `/${sub}` : ''}`;
  if (window.location.pathname !== next) {
    window.history.pushState(null, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute());
  useEffect(() => {
    const onChange = () => setRoute(parseRoute());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return route;
}

// ── admin console routing — slug-prefixed paths ───────────────────────────
// Every admin URL carries the 6-digit slug: /<slug>/<page> (e.g. /666453/users).
// Without the correct slug in the URL the console never renders.

/** Extract the slug + page from a /<6-digits>/<page> pathname. */
export function parseAdminRoute(pathname = window.location.pathname): { slug: string; page: string } | null {
  const m = pathname.match(/^\/(\d{6})(?:\/([a-z-]+))?\/?$/);
  if (!m) return null;
  return { slug: m[1], page: m[2] || 'overview' };
}

/** Navigate within the admin console — keeps the slug prefix. */
export function navigateAdmin(slug: string, page: string): void {
  const next = `/${slug}/${page}`;
  if (window.location.pathname !== next) {
    window.history.pushState(null, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

/** Legacy /platform/<page> support — redirect to /<slug>/<page> if slug is known. */
export function isLegacyPlatformPath(pathname = window.location.pathname): boolean {
  return pathname.startsWith('/platform/');
}
