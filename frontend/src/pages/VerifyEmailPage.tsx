import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { MailCheck, XCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      // Landed here without a token — maybe navigated back after verifying
      if (params.get('success') === '1') {
        setStatus('success');
        return;
      }
      setStatus('error');
      setMessage('No verification token found in the link.');
      return;
    }
    api
      .get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => {
        setStatus('success');
        // Replace the URL so that refreshing the page doesn't re-submit
        // the token and show a spurious "invalid link" error.
        navigate('/verify-email?success=1', { replace: true });
      })
      .catch((err) => {
        const detail =
          err?.response?.data?.detail ?? 'Verification failed. The link may be invalid or expired.';
        setMessage(detail);
        setStatus('error');
      });
  }, [token, params, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-muted bg-surface p-8 text-center shadow-lg">
        {status === 'loading' && (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-accent" />
            <p className="text-sm text-text-dim">Verifying your email…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <MailCheck className="mx-auto mb-4 h-10 w-10 text-accent" />
            <h1 className="mb-2 text-xl font-bold text-text">Email verified!</h1>
            <p className="mb-6 text-sm text-text-dim">
              Your account is now active. You can sign in.
            </p>
            <Button className="w-full" onClick={() => navigate('/login')}>
              Go to sign in
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
            <h1 className="mb-2 text-xl font-bold text-text">Verification failed</h1>
            <p className="mb-6 text-sm text-text-dim">{message}</p>
            <Link to="/login">
              <Button variant="secondary" className="w-full">
                Back to sign in
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
