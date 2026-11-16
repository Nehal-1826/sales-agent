import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  /** true until the first answer, and again when deps change — plain reloads keep showing old data */
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Load data once (and on demand). Out-of-order answers are dropped — a slow
 * earlier request can never overwrite a newer one — and a refresh keeps the
 * current data on screen instead of flashing a spinner.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  /** keep showing the old answer while deps-driven refetches run (same query, just fresher) */
  opts: { keepStale?: boolean } = {},
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const value = await loadRef.current();
      if (mine !== seq.current) return;
      setData(value);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(errorMessage(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  const first = useRef(true);
  useEffect(() => {
    // changed deps mean a different question (e.g. another agent's config):
    // never leave the previous answer on screen as if it were this one's
    if (!first.current && !opts.keepStale) {
      setData(null);
      setError(null);
      setLoading(true);
    }
    first.current = false;
    void reload();
    // reload is stable; deps decide when to refetch
  }, deps);

  return { data, error, loading, reload };
}

/** Current time, re-rendered every `ms` while `active` (for elapsed timers). */
export function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [active, ms]);
  return now;
}
