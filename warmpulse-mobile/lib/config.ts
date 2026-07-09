/**
 * Runtime configuration for the WarmPulse mobile app.
 *
 * API_BASE_URL points at the production backend (same origin the web app and
 * the hosted APK download live behind). Change it here for a staging build.
 */
export const API_BASE_URL = 'https://restinpices.com';

/* ---------------------------------------------------------------------------
 * Google / Firebase sign-in.
 *
 * Flow: Google sign-in (expo-auth-session) → Firebase credential → Firebase ID
 * token → backend verifies it at POST /api/auth/firebase (FIREBASE_PROJECT_ID
 * must match `projectId` below — it does: email-warmup-d918e).
 *
 * Firebase project + web OAuth client are wired. The one remaining piece is an
 * **Android OAuth client** (Google requires it for the native sign-in on a
 * standalone APK), created with package `com.warmpulse.app` + the release
 * signing SHA-1. Until `androidClientId` is filled, `googleEnabled` is false
 * and the Google button explains that instead of failing — no dead control.
 * ------------------------------------------------------------------------- */
export const firebaseConfig = {
  apiKey: 'AIzaSyCljc76Ilvb1NpDXtD3WxXmGMIBjleCCdg',
  authDomain: 'email-warmup-d918e.firebaseapp.com',
  projectId: 'email-warmup-d918e',
  appId: '1:1082337714849:web:a7cbb55a3efc38f3ec46e0',
};

/** OAuth client IDs from the Firebase project's Google Cloud console. */
export const googleOAuth = {
  /**
   * Web client ID — passed to GoogleSignin.configure({ webClientId }). It's the
   * audience of the ID token Firebase + the backend verify, so it MUST be the
   * *Web* OAuth client (type 3 in google-services.json), not the Android one.
   */
  webClientId: '1082337714849-rafcaavi4v8g3u7q1aritmge2vms2dc0.apps.googleusercontent.com',
  /**
   * Android OAuth client — NOT referenced in code. The native SDK matches the
   * app by package name + signing SHA-1 server-side, so it only has to exist in
   * Google Cloud (com.warmpulse.app + release SHA-1 43:D8:39:0C:…). For reference.
   */
  androidClientId: '1082337714849-jsvqr1uk7nutmonoeggl29le4ep998cp.apps.googleusercontent.com',
};

/** True once the Firebase web config + Web OAuth client are set (native flow). */
export const googleEnabled =
  !firebaseConfig.apiKey.startsWith('REPLACE') &&
  !googleOAuth.webClientId.startsWith('REPLACE');
