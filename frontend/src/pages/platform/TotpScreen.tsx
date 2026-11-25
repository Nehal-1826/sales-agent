import { useEffect, useRef, useState } from 'react';
import { CodeSlots, type CodeSlotsStatus } from '../../components/CodeSlots';
import { GlassBackdrop } from '../../components/Lightfall';
import { useCompactOtpSlots } from '../../components/TwoFactorPanel';
import { verifyUser2fa } from '../../lib/api';
import { totpVerify } from '../../lib/platform';

/** Two-factor gate for platform admins and 2FA-enabled workspace users. Both
 *  already have an authenticator — 2FA is turned on in Settings, never here. */
export function TotpScreen({
  isAdmin = true,
  onVerified,
  onSignOut,
}: {
  isAdmin?: boolean;
  onVerified: () => void;
  onSignOut: () => void;
}) {
  const [code, setCode] = useState('');
  const [slotStatus, setSlotStatus] = useState<CodeSlotsStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const compactSlots = useCompactOtpSlots(460);
  const doneTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  async function verifyCode(rawCode: string) {
    if (busy || slotStatus === 'success' || rawCode.length !== 6) return;
    setBusy(true);
    setError('');
    setSlotStatus('idle');
    const r = await (isAdmin ? totpVerify(rawCode) : verifyUser2fa(rawCode));
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
        <small className="login-footnote">Enter the 6-digit code from your authenticator app.</small>
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
          {busy ? 'Checking…' : 'Verify'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSignOut}>
          Sign out
        </button>
      </form>
    </div>
  );
}
