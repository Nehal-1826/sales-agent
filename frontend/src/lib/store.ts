/**
 * localStorage cleanup.
 *
 * Only the auth token is persisted (see transport.ts). Settings, agent
 * configs and secrets deliberately live server-side only — a stale local
 * copy used to overwrite real values and leak API keys into the browser.
 */

const PREFIX = 'agentic-ai:';

/** Wipe every agentic-ai:* key — called on sign-out. */
export function clearAll(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
}
