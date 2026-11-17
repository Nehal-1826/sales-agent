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

// ── platform console routing (one source of truth) ────────────────────────

export function navigatePlatform(page: string): void {
  const next = `/platform/${page}`;
  if (window.location.pathname !== next) {
    window.history.pushState(null, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

export function parsePlatformRoute(pathname = window.location.pathname): string {
  const m = pathname.match(/^\/platform\/([a-z-]+)/);
  return m ? m[1] : 'overview';
}
