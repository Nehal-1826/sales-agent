/**
 * Makes every page draw again the moment the person changes their format.
 *
 * The formatter (lib/format.ts) reads a saved value, so a screen that is
 * already open changes only when React draws it again. This component watches
 * the choice and calls `children` again when it changes: every page under it
 * shows the new format at once, and keeps its state (nothing is remounted).
 * It sits inside <main> in both apps (App's Shell, PlatformShell), so no page
 * has to remember to subscribe.
 */
import type { ReactNode } from 'react';
import { usePreferences } from '../lib/format';

export function FormatScope({ children }: { children: () => ReactNode }) {
  usePreferences();
  return <>{children()}</>;
}
