import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CodeSlots, type CodeSlotsStatus } from '../../components/CodeSlots';
import { GlassBackdrop } from '../../components/Lightfall';
import { totpConfirm, totpSetup, totpVerify } from '../../lib/platform';
import type { TotpSetup } from '../../lib/platform';

/** Two-factor gate for platform admins. The code is posted once and never stored. */
export function TotpScreen({ onVerified, onSignOut }: { onVerified: () => void; onSignOut: () => void }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [code, setCode] = useState('');
  const [slotStatus, setSlotStatus] = useState<CodeSlotsStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [compactSlots, setCompactSlots] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 460px)').matches,
  );
  const doneTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 460px)');
    const onChange = () => setCompactSlots(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  async function startEnroll() {
    setBusy(true);
    setError('');
    setSlotStatus('idle');
    const r = await totpSetup();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSetup(r.data);
    setEnrolling(true);
  }

  async function verifyCode(rawCode: string) {
    if (busy || rawCode.length !== 6) return;
    setBusy(true);
    setError('');
    setSlotStatus('idle');
    const r = await (enrolling ? totpConfirm(rawCode) : totpVerify(rawCode));
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

  const uri = setup?.otpauth_uri ?? setup?.otpauth_url ?? setup?.provisioning_uri;

  return (
    <div className="login-wrap">
      <GlassBackdrop />
      <form className="panel login-card" onSubmit={(e) => void submit(e)}>
        <strong className="login-headline">WarmPulse — Platform console</strong>
        <small className="login-footnote">
          {enrolling
            ? 'Add this key to your authenticator app, then enter the 6-digit code it shows.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </small>
        {enrolling && setup && (
          <div className="pf-secret">
            {uri && (
              <div className="pf-qr">
                <QRCodeSVG value={uri} size={176} level="M" marginSize={2} />
                <small className="login-footnote">
                  Scan with any authenticator — Google Authenticator, Authy, 1Password, Microsoft Authenticator.
                </small>
              </div>
            )}
          </div>
        )}
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
        {error && <p className="pf-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy || code.length !== 6 || slotStatus === 'success'}>
          {busy ? 'Checking…' : enrolling ? 'Confirm and sign in' : 'Verify'}
        </button>
        {!enrolling && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void startEnroll()}>
            Set up an authenticator (first time)
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onSignOut}>
          Sign out
        </button>
      </form>
    </div>
  );
}
