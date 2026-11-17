import { useEffect, useRef, useState } from 'react';
import { CodeSlots, type CodeSlotsStatus } from '../../components/CodeSlots';
import { GlassBackdrop } from '../../components/Lightfall';
import { TotpEnrollCard, useCompactOtpSlots } from '../../components/TwoFactorPanel';
import { verifyUser2fa } from '../../lib/api';
import { totpConfirm, totpSetup, totpVerify } from '../../lib/platform';
import type { TotpSetup } from '../../lib/platform';

/** Two-factor gate for platform admins (including first-time setup) and 2FA-enabled workspace users. */
export function TotpScreen({
  isAdmin = true,
  enrolled = true,
  onVerified,
  onSignOut,
}: {
  isAdmin?: boolean;
  enrolled?: boolean;
  onVerified: () => void;
  onSignOut: () => void;
}) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [enrolling, setEnrolling] = useState(isAdmin && !enrolled);
  const [code, setCode] = useState('');
  const [slotStatus, setSlotStatus] = useState<CodeSlotsStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [setupBusy, setSetupBusy] = useState(isAdmin && !enrolled);
  const [error, setError] = useState('');
  const compactSlots = useCompactOtpSlots(460);
  const doneTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  async function startEnroll() {
    setSetupBusy(true);
    setError('');
    setSlotStatus('idle');
    const r = await totpSetup();
    setSetupBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setSetup(r.data);
    setEnrolling(true);
  }

  // Platform admins without a secret must enroll on first login — open QR setup automatically.
  // Share one inflight promise across React 18 StrictMode's double-mount so we never generate two secrets.
  const autoSetupInFlight = useRef<ReturnType<typeof totpSetup> | null>(null);
  useEffect(() => {
    if (!isAdmin || enrolled) return;
    let alive = true;
    setSetupBusy(true);
    const req = autoSetupInFlight.current ?? (autoSetupInFlight.current = totpSetup());
    req.then((r) => {
      if (!alive) return;
      autoSetupInFlight.current = null;
      setSetupBusy(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSetup(r.data);
      setEnrolling(true);
    });
    return () => {
      alive = false;
    };
  }, [isAdmin, enrolled]);

  async function verifyCode(rawCode: string) {
    if (busy || slotStatus === 'success' || rawCode.length !== 6) return;
    setBusy(true);
    setError('');
    setSlotStatus('idle');
    const r = await (enrolling
      ? totpConfirm(rawCode)
      : isAdmin
        ? totpVerify(rawCode)
        : verifyUser2fa(rawCode));
    setBusy(false);
    if (!r.ok) {
      setSlotStatus('error');
      setError(r.error);
      return;
    }
    setSlotStatus('success');
    setCode(''); // never keep the code around
    doneTimer.current = window.setTimeout(onVerified, 450);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await verifyCode(code);
  }

  return (
    <div className="login-wrap">
      <GlassBackdrop />
      <form className="panel login-card" onSubmit={(e) => void submit(e)}>
        <strong className="login-headline">
          {isAdmin ? 'WarmPulse — Platform console' : 'WarmPulse — Two-factor check'}
        </strong>
        <small className="login-footnote">
          {enrolling
            ? 'Scan the QR code or add the key to your authenticator app, then enter the 6-digit code.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </small>
        {isAdmin && !enrolled && setupBusy && !setup && (
          <small className="login-footnote">Preparing authenticator setup…</small>
        )}
        {enrolling && setup && <TotpEnrollCard setup={setup} />}
        {(!isAdmin || enrolled || setup) && (
          <>
            <div className="field otp-slots-field">
              <span className="field-label">6-digit code</span>
              <CodeSlots
                length={6}
                value={code}
                status={slotStatus}
                disabled={busy}
                slotSize={compactSlots ? 38 : 49}
                gap={compactSlots ? 6 : 10}
                accentColor="#f97316"
                inkColor="#ffffff"
                slotColor="rgba(255, 255, 255, 0.08)"
                digitColor="#f5f2ed"
                dangerColor="#f87171"
                autoFocus
                ariaLabel="6-digit verification code"
                onChange={(next) => {
                  setCode(next);
                  if (slotStatus === 'error') {
                    setSlotStatus('idle');
                    setError('');
                  }
                }}
                onComplete={(full) => void verifyCode(full)}
              />
            </div>
            {error && (
              <p className="pf-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary" disabled={busy || code.length !== 6 || slotStatus === 'success'}>
              {busy ? 'Checking…' : enrolling ? 'Confirm and sign in' : 'Verify'}
            </button>
          </>
        )}
        {isAdmin && !enrolled && !setup && !setupBusy && (
          <>
            {error && (
              <p className="pf-error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn btn-primary" onClick={() => void startEnroll()}>
              Retry authenticator setup
            </button>
          </>
        )}
        <button type="button" className="btn btn-ghost" onClick={onSignOut}>
          Sign out
        </button>
      </form>
    </div>
  );
}
