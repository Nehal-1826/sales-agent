import { useEffect, useState } from 'react';
import type { PageKey } from './types';

/**
 * Hash router — #/page or #/page/sub (e.g. #/leads/board, #/settings/email).
 * No library: six pages, one optional sub-key. Refresh keeps the page, and
 * links can deep-link into a tab or settings section.
 */

const PAGES: PageKey[] = ['home', 'approvals', 'leads', 'activity', 'assistant', 'settings'];

export interface Route {
  page: PageKey;
  sub: string;
}

export function parseHash(hash = window.location.hash): Route {
  const [page = '', sub = ''] = hash.replace(/^#\/?/, '').split('/');
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
  const next = `#/${page}${sub ? `/${sub}` : ''}`;
  if (window.location.hash !== next) window.location.hash = next;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash());
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
