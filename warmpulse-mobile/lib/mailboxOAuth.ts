/**
 * OAuth for mailbox connection (Gmail & Outlook) - WebBrowser-based flow.
 *
 * Opens OAuth in device browser, handles deep link back to app with tokens.
 * Backend handles token exchange and returns OAuth result.
 */
import { useCallback, useRef } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API_BASE_URL } from './config';

export type MailboxOAuthResult = {
  provider: 'gmail' | 'outlook';
  email: string;
  success: boolean;
  error?: string;
};

// Track pending OAuth requests
const pendingRequests = new Map<string, { resolve: (result: MailboxOAuthResult) => void }>();

/**
 * Handle OAuth deep link callback when app returns from browser
 */
export function handleOAuthCallback(url: string) {
  console.log('handleOAuthCallback called with:', url);

  // Dismiss the browser immediately when callback is received
  WebBrowser.dismissBrowser().catch(() => {
    // Browser may already be closed, ignore error
  });

  try {
    // Parse the callback URL to extract OAuth result
    // The backend redirects to: warmpulse://oauth/callback?provider=gmail&success=true&email=...
    const parsed = new URL(url);
    const provider = parsed.searchParams.get('provider') as 'gmail' | 'outlook' | null;
    const success = parsed.searchParams.get('success') === 'true';
    const email = parsed.searchParams.get('email') || '';
    const error = parsed.searchParams.get('error') || '';

    console.log('OAuth parsed result:', { provider, success, email, error });

    if (provider && (success || error)) {
      const requestId = parsed.searchParams.get('state') || '';
      console.log('Looking for pending request with ID starting with:', `${provider}-`);

      // Resolve any pending request with this provider
      for (const [id, req] of pendingRequests.entries()) {
        if (id.startsWith(`${provider}-`)) {
          console.log('Found pending request, resolving with ID:', id);
          req.resolve({ provider, email, success, error: error || undefined });
          pendingRequests.delete(id);
          break;
        }
      }
      console.log('Pending requests after callback:', Array.from(pendingRequests.keys()));
    }
  } catch (e) {
    console.error('OAuth callback error:', e);
  }
}

/**
 * Start Gmail OAuth for mailbox connection
 */
export function useGmailMailboxOAuth() {
  const signIn = useCallback(async (): Promise<MailboxOAuthResult> => {
    const requestId = `gmail-${Date.now()}`;
    const redirectUri = 'warmpulse://oauth/callback';

    return new Promise((resolve) => {
      pendingRequests.set(requestId, { resolve });

      const authUrl = `${API_BASE_URL}/api/auth/google/oauth-start?intent=mailbox&state=${requestId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

      WebBrowser.openBrowserAsync(authUrl, {
        dismissWindow: false,
      }).then((result) => {
        if (result.type === 'cancel') {
          pendingRequests.delete(requestId);
          resolve({ provider: 'gmail', email: '', success: false, error: 'Cancelled' });
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          resolve({ provider: 'gmail', email: '', success: false, error: 'Timeout' });
        }
      }, 300000);
    });
  }, []);

  return { signIn };
}

/**
 * Start Outlook OAuth for mailbox connection
 */
export function useOutlookMailboxOAuth() {
  const signIn = useCallback(async (): Promise<MailboxOAuthResult> => {
    const requestId = `outlook-${Date.now()}`;
    const redirectUri = 'warmpulse://oauth/callback';

    return new Promise((resolve) => {
      pendingRequests.set(requestId, { resolve });

      const authUrl = `${API_BASE_URL}/api/auth/microsoft/oauth-start?intent=mailbox&state=${requestId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

      WebBrowser.openBrowserAsync(authUrl, {
        dismissWindow: false,
      }).then((result) => {
        if (result.type === 'cancel') {
          pendingRequests.delete(requestId);
          resolve({ provider: 'outlook', email: '', success: false, error: 'Cancelled' });
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          resolve({ provider: 'outlook', email: '', success: false, error: 'Timeout' });
        }
      }, 300000);
    });
  }, []);

  return { signIn };
}
