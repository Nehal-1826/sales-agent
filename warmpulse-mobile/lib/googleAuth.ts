/**
 * Google sign-in for the mobile app — native Google Sign-In SDK.
 *
 * Why native (not expo-auth-session browser flow): a standalone Android APK
 * can't use the browser id_token/implicit flow — Google only allows that for
 * Web OAuth clients, and Web clients reject custom-scheme redirects, so the
 * browser approach returns "Error 400: invalid_request". The native SDK has no
 * browser/redirect: it authenticates against the Android OAuth client
 * (package com.warmpulse.app + release SHA-1, registered in Google Cloud) and,
 * given the Web client ID as `webClientId`, returns a Google ID token whose
 * audience is the Web client — exactly what Firebase + our backend verify.
 *
 * Flow: GoogleSignin → Google ID token → Firebase credential → Firebase ID
 * token → POST /api/auth/firebase.
 */
import { useCallback } from 'react';
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { firebaseConfig, googleOAuth, googleEnabled } from './config';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: googleOAuth.webClientId });
  configured = true;
}

function firebaseAuth() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}

export type UseGoogleSignIn = {
  /** Launch the native Google account picker. Returns false when not configured. */
  signIn: () => Promise<boolean>;
  /** True once real config is present (button is actionable). */
  ready: boolean;
  /** True while config is still placeholder — UI explains it's not set up. */
  notConfigured: boolean;
};

/**
 * @param onIdToken called with a backend-verifiable Firebase ID token on success
 * @param onError   called with a human message on cancel/failure
 */
export function useGoogleSignIn(
  onIdToken: (idToken: string) => void,
  onError: (message: string) => void,
): UseGoogleSignIn {
  const signIn = useCallback(async (): Promise<boolean> => {
    if (!googleEnabled) {
      onError('Google sign-in isn’t configured yet. Add your Web client ID in lib/config.ts.');
      return false;
    }
    try {
      ensureConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        // user dismissed the picker
        return false;
      }
      const googleIdToken = response.data.idToken;
      if (!googleIdToken) {
        onError('Google did not return an ID token.');
        return true;
      }
      const credential = GoogleAuthProvider.credential(googleIdToken);
      const result = await signInWithCredential(firebaseAuth(), credential);
      const firebaseIdToken = await result.user.getIdToken();
      onIdToken(firebaseIdToken);
      return true;
    } catch (e) {
      if (isErrorWithCode(e)) {
        if (e.code === statusCodes.SIGN_IN_CANCELLED) return false;
        if (e.code === statusCodes.IN_PROGRESS) {
          onError('Sign-in already in progress.');
          return true;
        }
        if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          onError('Google Play Services is not available on this device.');
          return true;
        }
      }
      onError('Google sign-in failed. Please try again.');
      return true;
    }
  }, [onIdToken, onError]);

  return {
    ready: googleEnabled,
    notConfigured: !googleEnabled,
    signIn,
  };
}
