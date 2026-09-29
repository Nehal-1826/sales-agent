/**
 * Tiny localStorage persistence layer.
 *
 * Everything is frontend-only for now; when the backend exists these
 * helpers get replaced by real API calls in src/lib/api.ts.
 */

const PREFIX = 'agentic-ai:';

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return { ...(fallback as object), ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — ignore, mock mode only */
  }
}

export function clearAll(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
