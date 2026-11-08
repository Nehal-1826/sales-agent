import { useEffect, useState } from 'react';
import { verifyEmail } from '../lib/api';

// the token is single-use: StrictMode / remounts must share one request, or the
// second POST gets "already used" and overwrites the success of the first
const inflight = new Map<string, ReturnType<typeof verifyEmail>>();
function verifyOnce(token: string) {
  let p = inflight.get(token);
  if (!p) {
    p = verifyEmail(token);
    inflight.set(token, p);
  }
  return p;
}

/** /?verify=<token> — confirms the signup email address. */
export function VerifyEmailPage({ token, onDone }: { token: string; onDone: () => void }) {
  const [state, setState] = useState<'working' | 'ok' | 'failed'>('working');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let live = true;
    verifyOnce(token).then((r) => {
      if (!live) return;
      if (r.ok) setState('ok');
      else {
        setState('failed');
        setMsg(r.error);
      }
    });
    return () => {
      live = false;
    };
  }, [token]);

  const done = () => {
    window.history.replaceState(null, '', '/');
    onDone();
  };

  return (
    <div className="login-wrap">
      <div className="panel login-card login-card-center" role="status">
        <img src="/logo.png" alt="Shailog Technologies" className="login-logo" />
        {state === 'working' && <span className="spinner" aria-hidden />}
        {state === 'ok' && <strong className="login-headline">Email verified</strong>}
        {state === 'failed' && (
          <>
            <strong className="login-headline">That link did not work</strong>
            <small className="login-footnote">
              {msg || 'It may have expired or already been used.'} Sign in and use "Resend email" to get a new one.
            </small>
          </>
        )}
        {state !== 'working' && (
          <button className="btn btn-primary" onClick={done}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
