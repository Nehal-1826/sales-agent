/**
 * Microsoft sign-in for the mobile app — Expo Auth Session + Firebase.
 *
 * Uses expo-auth-session for the OAuth flow and Firebase to mint a backend-
 * verifiable ID token. The flow:
 * 1. expo-auth-session opens Microsoft OAuth in browser/app
 * 2. User grants permissions
 * 3. Microsoft redirects back with authorization code
 * 4. We exchange the code for an access token
 * 5. Firebase signs in with the OAuth credential
 * 6. Firebase returns a Firebase ID token
 * 7. POST /api/auth/firebase with the ID token
 *
 * Requires Microsoft OAuth provider enabled in Firebase Console.
 */
import { useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { OAuthProvider, getAuth, signInWithCredential } from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { firebaseConfig } from './config';

// Enable WebBrowser for auth flow
WebBrowser.maybeCompleteAuthSession();

function firebaseAuth() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}

// Microsoft OAuth discovery doc
const discovery = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/token',
};

export type UseMicrosoftSignIn = {
  /** Launch the Microsoft OAuth flow. Returns false when not configured. */
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
export function useMicrosoftSignIn(
  onIdToken: (idToken: string) => void,
  onError: (message: string) => void,
): UseMicrosoftSignIn {
  const signIn = useCallback(async (): Promise<boolean> => {
    if (!firebaseConfig.apiKey) {
      onError('Microsoft sign-in isn\'t configured. Enable Microsoft provider in Firebase Console.');
      return false;
    }

    try {
      const auth = firebaseAuth();

      // Create the OAuth request
      const request = new AuthSession.AuthRequest({
        clientId: firebaseConfig.appId || '',
        scopes: ['openid', 'profile', 'email'],
        redirectUri: AuthSession.makeRedirectUri({
          scheme: 'warmpulse', // Must match app.json scheme
        }),
        extraParams: {
          prompt: 'select_account',
          response_type: 'code',
        },
      });

      const result = await request.promptAsync(discovery, {
        authUrl: discovery.authorizationEndpoint,
      });

      if (result.type === 'success') {
        // Exchange the auth code for tokens using Microsoft's token endpoint
        const tokenResponse = await fetch(discovery.tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: firebaseConfig.appId || '',
            code: result.params.code,
            redirect_uri: AuthSession.makeRedirectUri({ scheme: 'warmpulse' }),
            grant_type: 'authorization_code',
          }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
          onError('Microsoft OAuth failed: ' + tokenData.error_description);
          return true;
        }

        // Sign in to Firebase with the OAuth credential
        const credential = OAuthProvider.credential({
          idToken: tokenData.id_token,
          accessToken: tokenData.access_token,
        });

        const userCredential = await signInWithCredential(auth, credential);
        const firebaseIdToken = await userCredential.user.getIdToken();
        onIdToken(firebaseIdToken);
        return true;
      }

      return false;
    } catch (e) {
      if (e instanceof Error) {
        // User cancelled
        if (e.message.includes('canceled') || e.message.includes('ERR_CANCELLED')) {
          return false;
        }
      }
      onError('Microsoft sign-in failed. Please try again.');
      return true;
    }
  }, [onIdToken, onError]);

  return {
    ready: !!firebaseConfig.apiKey && !!firebaseConfig.appId,
    notConfigured: !firebaseConfig.apiKey || !firebaseConfig.appId,
    signIn,
  };
}
