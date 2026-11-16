import { useEffect, type ReactNode } from 'react';

const THEME_KEY = 'warmpulse.theme';

/**
 * Sets BOTH the legacy `.dark` Tailwind class (still used by app shell tokens)
 * AND the new `data-theme="dark|light"` attribute that hero-theme.css reads.
 *
 * Reads from localStorage first, falls back to system preference, defaults dark.
 * Ensures CSS vars are populated on every entry point — including direct
 * landings on /signup or /login (where the hero's useTheme hook never ran).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;

    const stored = window.localStorage.getItem(THEME_KEY);
    const sysLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = stored === 'dark' || stored === 'light' ? stored : sysLight ? 'light' : 'dark';

    root.dataset.theme = theme;
    // Keep the legacy `.dark` class in lock-step with data-theme so the few
    // `dark:` Tailwind variants in the app resolve correctly. Previously this
    // always added `.dark`, leaving a stored light preference half-applied.
    root.classList.toggle('dark', theme === 'dark');
  }, []);
  return <>{children}</>;
}
