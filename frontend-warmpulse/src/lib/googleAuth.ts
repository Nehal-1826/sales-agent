/**
 * Robust Google sign-in via Firebase.
 *
 * Two completion paths:
 *
 *   • POPUP (the fast path on desktop) — `signInWithPopup` resolves with
 *     the user. We hand it straight to the caller's `onUser` callback;
 *     no `onAuthStateChanged` listener is needed.
 *
 *   • REDIRECT (the popup-blocked fallback) — we call `signInWithRedirect`
 *     which navigates away to Google. The user comes back to /login and
 *     `subscribeToGoogleAuth()` (called from the LoginPage useEffect)
 *     picks up the resumed auth state via `onAuthStateChanged`.
 *
 * Both paths gate on a sessionStorage `PENDING_KEY` flag so a casual visit
 * to /login while already signed-in to Firebase doesn't auto-relogin.
 *
 * Latency notes: we deliberately STATIC-import `firebase/auth` (rather
 * than dynamic-importing it as a code-splitting optimization). The
 * dynamic-import variant saved ~80 KB on the eager bundle but caused
 * Vite's dep optimizer to run a SECONDARY pass on the first `import()`
 * — invalidating every other dep chunk and 504'ing the rest of the
 * page. Static import = predictable, no optimizer reshuffles. The
 * costlier latency knobs (skipping `getRedirectResult` on cold mounts,
 * delivering the popup user directly without bouncing through
 * `onAuthStateChanged`, pre-warming Google's cert cache on the
 * backend) all still apply and dominate the actual login time anyway.
 */
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

export const PENDING_KEY = 'warmpulse.googleAuthPending';
const log = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  console.log('[GoogleAuth]', ...args);
};

/**
 * No-op kept for API stability with previous lazy-loading variant. The
 * Firebase SDK is now in the eager bundle, so there's nothing to
 * prefetch on hover. Safe to remove from call sites or leave as a
 * future-proofing hook.
 */
export function prefetchGoogleAuth(): void {
  // Intentionally empty — firebase/auth is statically imported above.
}

/**
 * Subscribe to Firebase auth state. Callback fires when a real user
 * appears AND we have a pending-flag (meaning we kicked off a sign-in
 * this session). Returns the unsubscribe fn.
 *
 * Cold-mount optimization: when there is no PENDING_KEY flag in
 * sessionStorage we DON'T call `getRedirectResult` at all (~100–300 ms
 * IndexedDB hydration saved on every casual /login visit). The
 * subscription itself is cheap once the SDK is loaded.
 */
export function subscribeToGoogleAuth(
  onUser: (firebaseUser: User) => void | Promise<void>,
): () => void {
  const hasPending =
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(PENDING_KEY) !== null;

  log(hasPending ? 'pending flag present — subscribing' : 'no pending flag — subscribing without getRedirectResult');

  if (hasPending) {
    // Only fire getRedirectResult when we expect a redirect-return —
    // it forces IndexedDB hydration which is the dominant cost.
    getRedirectResult(auth)
      .then((r) => log('getRedirectResult →', r?.user?.email ?? null))
      .catch((err) => log('getRedirectResult ERROR:', err));
  }

  return onAuthStateChanged(auth, async (firebaseUser) => {
    log('onAuthStateChanged →', firebaseUser?.email ?? null);
    if (!firebaseUser) return;
    const pending = window.sessionStorage.getItem(PENDING_KEY);
    if (!pending) {
      log('no pending flag, ignoring (existing session)');
      return;
    }
    log('pending flag set — running completion handler');
    window.sessionStorage.removeItem(PENDING_KEY);
    try {
      await onUser(firebaseUser);
    } catch (err) {
      // Re-arm so user can retry.
      window.sessionStorage.setItem(PENDING_KEY, '1');
      throw err;
    }
  });
}

/**
 * Outcome of kicking off Google sign-in.
 *
 *  - `popup-success` — popup resolved and we already have the Firebase
 *    user. Caller should run the backend exchange on `.user`.
 *  - `redirect-in-flight` — page is about to navigate to Google. The
 *    `subscribeToGoogleAuth` listener at /login mount will complete
 *    the flow on return.
 *  - `cancelled` — user closed the popup before picking an account.
 *    Caller MUST reset its loading spinner.
 */
export type SignInStartResult =
  | { outcome: 'popup-success'; user: User }
  | { outcome: 'redirect-in-flight' }
  | { outcome: 'cancelled' };

/**
 * Kick off Google sign-in. Tries popup first; falls back to redirect
 * if blocked. Returns the Firebase user directly on the popup success
 * path so the caller doesn't need an `onAuthStateChanged` listener
 * for that case — saves one IndexedDB-hydration round-trip per login.
 */
export async function startGoogleSignIn(): Promise<SignInStartResult> {
  log('starting sign-in');
  window.sessionStorage.setItem(PENDING_KEY, '1');

  try {
    log('trying signInWithPopup');
    const cred = await signInWithPopup(auth, googleProvider);
    log('signInWithPopup resolved →', cred.user.email);
    // Popup path completes synchronously via the return value — clear
    // the pending flag here so the mount-listener doesn't double-fire.
    window.sessionStorage.removeItem(PENDING_KEY);
    return { outcome: 'popup-success', user: cred.user };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    log('signInWithPopup failed with code:', code);
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      window.sessionStorage.removeItem(PENDING_KEY);
      return { outcome: 'cancelled' };
    }
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/web-storage-unsupported' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/internal-error'
    ) {
      log('falling back to signInWithRedirect');
      await signInWithRedirect(auth, googleProvider);
      return { outcome: 'redirect-in-flight' };
    }
    window.sessionStorage.removeItem(PENDING_KEY);
    throw err;
  }
}
