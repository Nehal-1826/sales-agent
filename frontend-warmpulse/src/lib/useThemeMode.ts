import { useCallback, useSyncExternalStore } from 'react';

/**
 * Lightweight client-side theme control shared by the in-app shells.
 *
 * The source of truth at runtime is `document.documentElement.dataset.theme`
 * ('light' | 'dark') — the same attribute ThemeProvider and ProSettings set.
 * We persist the choice under `warmpulse.theme` so it survives reloads, keep
 * the legacy `.dark` Tailwind class in lock-step (a few `dark:` variants still
 * rely on it), and broadcast a `wp-theme-change` event so every mounted toggle
 * re-renders together.
 */
const THEME_KEY = 'warmpulse.theme';
const THEME_EVENT = 'wp-theme-change';

export type ThemeMode = 'light' | 'dark';

function currentTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Resolve a user preference (which may be "system") to a concrete theme. */
export function resolveThemeMode(pref: 'light' | 'dark' | 'system'): ThemeMode {
  if (pref !== 'system') return pref;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function applyThemeMode(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // Idempotent: only broadcast when the resolved theme actually changes.
  // This is what lets the Settings page and the sidebar toggle drive each
  // other without an infinite event↔effect loop — re-applying the same
  // theme is a silent no-op.
  const changed =
    root.dataset.theme !== theme ||
    root.classList.contains('dark') !== (theme === 'dark');
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage may be unavailable (private mode) — DOM change still applies */
  }
  if (changed) window.dispatchEvent(new Event(THEME_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useThemeMode(): { theme: ThemeMode; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'dark' as ThemeMode);
  const toggle = useCallback(() => {
    applyThemeMode(currentTheme() === 'dark' ? 'light' : 'dark');
  }, []);
  return { theme, toggle };
}
