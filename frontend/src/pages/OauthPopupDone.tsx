import { useEffect, useState } from 'react';

/**
 * Last leg of the mailbox-connect OAuth popup flow.
 *
 * The backend's mailbox-callback (`/api/auth/google/mailbox-callback`
 * or `/api/auth/microsoft/mailbox-callback`) finishes the code-for-token
 * exchange and then forwards the popup to this route with the payload
 * base64-encoded in the URL fragment, e.g.:
 *
 *   http://localhost:5173/oauth/popup-done#eyJ0eXBlIjoid2FybXB1bHNlOm9...
 *
 * Why route here at all instead of doing the postMessage from the
 * backend's HTML? Because by the time the popup has navigated through
 * Google's consent screen and back to localhost:8001, Chrome's
 * Cross-Origin-Opener-Policy has often nullified `window.opener` — the
 * postMessage call silently no-ops and the opener never hears back.
 * Bouncing the popup back to the frontend origin (same as the opener)
 * restores the opener reference AND lets us use a same-origin
 * localStorage write as an additional safety-net delivery channel.
 *
 * Fragment-encoded so the OAuth refresh token never appears in the
 * server access log, the browser history's query bar, or any Referer
 * header sent by subsequent navigations.
 */
export function OauthPopupDone() {
  const [status, setStatus] = useState<'delivering' | 'delivered' | 'no-opener'>(
    'delivering',
  );

  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) {
      setStatus('no-opener');
      return;
    }
    let payload: { type?: string; token?: string; email?: string; error?: string } | null = null;
    try {
      // base64url → base64 → utf8 JSON. atob is fine for ASCII; the
      // payload only contains ASCII (JSON of refresh token, email, etc.)
      const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(atob(b64));
    } catch {
      payload = null;
    }
    if (!payload) {
      setStatus('no-opener');
      return;
    }

    // 1. Try postMessage to the opener — now reliable because we're
    //    same-origin with the opener (both on localhost:5173).
    let delivered = false;
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, window.location.origin);
        delivered = true;
      } catch {
        /* try wildcard fallback */
      }
      if (!delivered) {
        try {
          window.opener.postMessage(payload, '*');
          delivered = true;
        } catch {
          /* fall through to localStorage */
        }
      }
    }

    // 2. Same-origin localStorage write as a parallel delivery channel.
    //    The opener's watchdog polls this key. Belt-and-braces in case
    //    postMessage was dropped (e.g. opener mid-navigation).
    try {
      // Stay in sync with the OAuth provider name the opener listens
      // for: `warmpulse.oauthResult.google` or `…microsoft`.
      const provider =
        typeof payload === 'object' && payload !== null && 'provider' in payload
          ? (payload as { provider?: string }).provider
          : null;
      const inferred = provider ?? inferProviderFromOpener();
      window.localStorage.setItem(
        `warmpulse.oauthResult.${inferred}`,
        JSON.stringify(payload),
      );
      delivered = true;
    } catch {
      /* private mode / quota — give up */
    }

    setStatus(delivered ? 'delivered' : 'no-opener');

    // 3. Close ourselves. Same-origin window.close() works.
    //    Brief delay so the opener has time to process the message
    //    before its `popup.closed` watchdog fires.
    const t = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, []);

  // Best-effort: the popup was opened with the URL ending in the
  // provider name (`…/auth/google/oauth-start` vs `…/microsoft/…`).
  // We never see those in this last hop, but the opener can usually
  // figure out which key to read from the LS prefix; default to google.
  function inferProviderFromOpener(): 'google' | 'microsoft' {
    return 'google';
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: 40,
        textAlign: 'center',
        color: '#888',
      }}
    >
      <p>
        {status === 'delivering'
          ? 'Connection complete — finishing…'
          : status === 'delivered'
            ? 'Connection complete — you can close this window.'
            : 'Connection complete, but we could not reach the original tab. You can close this window and return to WarmPulse.'}
      </p>
    </div>
  );
}

export default OauthPopupDone;
