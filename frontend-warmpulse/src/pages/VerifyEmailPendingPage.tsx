import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Mail, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/AppToast';

export default function VerifyEmailPendingPage() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    if (resending || resent) return;
    setResending(true);
    try {
      await api.post('/auth/resend-verification', { email, password: '' });
      setResent(true);
      toast.success('Verification email sent — check your inbox.');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        toast.error('Please wait a moment before requesting another email.');
      } else {
        toast.error('Could not resend — please try again shortly.');
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-muted bg-surface p-8 text-center shadow-lg">
        <Mail className="mx-auto mb-4 h-10 w-10 text-accent" />
        <h1 className="mb-2 text-xl font-bold text-text">Check your inbox</h1>
        <p className="mb-1 text-sm text-text-dim">
          We sent a verification link to
        </p>
        {email && (
          <p className="mb-6 font-medium text-text">{email}</p>
        )}
        <p className="mb-6 text-xs text-text-dim">
          Click the link in the email to activate your account. The link expires in 24 hours.
        </p>

        <Button
          variant="secondary"
          className="w-full"
          onClick={handleResend}
          disabled={resending || resent}
          leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${resending ? 'animate-spin' : ''}`} />}
        >
          {resent ? 'Email sent!' : resending ? 'Sending…' : 'Resend verification email'}
        </Button>

        <p className="mt-4 text-xs text-text-dim">
          Already verified?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
