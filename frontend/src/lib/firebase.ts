/**
 * Firebase — Google sign-in for the login card (owner choice over raw OAuth).
 *
 * The web config arrives via build-time env (VITE_FIREBASE_*) from
 * .env.local / the VPS compose build args — a Firebase apiKey is public by
 * design, but this repo has push protection on AIza* keys, so it never
 * lives in git. When the env is absent the Google button simply hides.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup } from 'firebase/auth';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

let app: FirebaseApp | null = null;

/** True when the build carries a full Firebase config — gates the button. */
export function isFirebaseConfigured(): boolean {
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
}

/** Popup Google sign-in → the Firebase ID token for OUR backend to verify. */
export async function googlePopupIdToken(): Promise<string> {
  if (!app) app = initializeApp(cfg as Record<string, string>);
  const cred = await signInWithPopup(getAuth(app), new GoogleAuthProvider());
  return cred.user.getIdToken();
}
