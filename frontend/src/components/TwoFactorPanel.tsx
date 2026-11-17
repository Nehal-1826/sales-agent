import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { CodeSlots, type CodeSlotsStatus } from './CodeSlots';
import { toast } from './feedback';
import { Chip } from './ui';
import type { TotpSetup } from '../lib/platform';
import type { Result } from '../lib/transport';

export interface TwoFactorApi {
  getStatus: () => Promise<{ enabled: boolean }>;
  setup: () => Promise<Result<TotpSetup>>;
  confirm: (code: string) => Promise<Result<unknown>>;
  disable: (code: string) => Promise<Result<unknown>>;
  rotateStart: (code: string) => Promise<Result<TotpSetup>>;
  rotateConfirm: (code: string) => Promise<Result<unknown>>;
}

type PanelMode = 'loading' | 'disabled' | 'setup' | 'enabled' | 'verify-rotate' | 'rotate-setup' | 'verify-disable';

const STAGE_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function formatSecret(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

export function useCompactOtpSlots(maxWidthPx = 520): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const onChange = () => setCompact(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [maxWidthPx]);
  return compact;
}

/** QR + manual base32 secret card shared by TotpScreen and Settings 2FA. */
export function TotpEnrollCard({ setup }: { setup: TotpSetup }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const uri = setup.otpauth_uri ?? setup.otpauth_url ?? setup.provisioning_uri;

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  async function copySecret() {
    if (!setup.secret) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.info('Copy the key manually from the box above.');
    }
  }

  return (
    <div className="tfa-enroll-card">
      {uri && (
        <div className="tfa-qr-wrap">
          <div className="tfa-qr-box">
            <QRCodeSVG value={uri} size={168} level="M" marginSize={2} />
          </div>
          <small className="field-hint">
            Scan with Google Authenticator, Authy, 1Password, or Microsoft Authenticator.
          </small>
        </div>
      )}
      {setup.secret && (
        <div className="tfa-manual">
          <span className="field-hint">Can’t scan? Enter this setup key manually</span>
          <div className="tfa-secret-row">
            <code className="tfa-secret-code">{revealed ? formatSecret(setup.secret) : '•••• •••• •••• ••••'}</code>
            <div className="tfa-secret-btns">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setRevealed((v) => !v)}
                aria-pressed={revealed}
              >
                {revealed ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copySecret()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shared spring-animated 2FA security panel for both User Settings and Platform Admin Settings.
 * Uses the exact same CodeSlots spring + error drain + orange checkmark wash as TotpScreen.
 */
export function TwoFactorPanel({
  api,
  demo = false,
  description,
  enabledNote,
  onStatusChange,
}: {
  api: TwoFactorApi;
  demo?: boolean;
  description: string;
  enabledNote: string;
  onStatusChange?: (enabled: boolean) => void;
}) {
  const reduce = !!useReducedMotion();
  const compactSlots = useCompactOtpSlots(520);
  const [mode, setMode] = useState<PanelMode>('loading');
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [slotStatus, setSlotStatus] = useState<CodeSlotsStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const doneTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.getStatus();
        if (!alive) return;
        setMode(res.enabled ? 'enabled' : 'disabled');
        onStatusChange?.(res.enabled);
      } catch {
        if (!alive) return;
        setMode('disabled');
        onStatusChange?.(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetInput() {
    setCode('');
    setSlotStatus('idle');
    setError('');
  }

  function transitionAfterSuccess(next: () => void) {
    setSlotStatus('success');
    setCode('');
    window.clearTimeout(doneTimer.current);
    doneTimer.current = window.setTimeout(() => {
      setSlotStatus('idle');
      next();
    }, reduce ? 120 : 520);
  }

  async function startEnable() {
    if (busy) return;
    setBusy(true);
    resetInput();
    const res = await api.setup();
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSetup(res.data);
    setMode('setup');
  }

  function enterVerify(nextMode: 'verify-rotate' | 'verify-disable') {
    resetInput();
    setSetup(null);
    setMode(nextMode);
  }

  function cancelFlow(target: 'disabled' | 'enabled') {
    window.clearTimeout(doneTimer.current);
    resetInput();
    setSetup(null);
    setMode(target);
  }

  async function submitCode(rawCode: string) {
    if (busy || slotStatus === 'success' || rawCode.length !== 6) return;
    setBusy(true);
    setError('');
    setSlotStatus('idle');

    if (mode === 'setup' || mode === 'rotate-setup') {
      const res = await (mode === 'rotate-setup' ? api.rotateConfirm(rawCode) : api.confirm(rawCode));
      setBusy(false);
      if (!res.ok) {
        setSlotStatus('error');
        setError(res.error);
        return;
      }
      const msg = mode === 'rotate-setup' ? 'Authenticator updated.' : 'Two-factor authentication enabled.';
      transitionAfterSuccess(() => {
        setSetup(null);
        setMode('enabled');
        onStatusChange?.(true);
        toast.success(msg);
      });
      return;
    }

    if (mode === 'verify-rotate') {
      const res = await api.rotateStart(rawCode);
      setBusy(false);
      if (!res.ok) {
        setSlotStatus('error');
        setError(res.error);
        return;
      }
      transitionAfterSuccess(() => {
        setSetup(res.data);
        setMode('rotate-setup');
      });
      return;
    }

    if (mode === 'verify-disable') {
      const res = await api.disable(rawCode);
      setBusy(false);
      if (!res.ok) {
        setSlotStatus('error');
        setError(res.error);
        return;
      }
      transitionAfterSuccess(() => {
        setSetup(null);
        setMode('disabled');
        onStatusChange?.(false);
        toast.success('Two-factor authentication disabled.');
      });
    }
  }

  const stageMotion = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.2, ease: STAGE_EASE },
      };

  const renderSlots = (label: string, onCancel: () => void, submitLabel: string, danger = false) => (
    <form
      className="tfa-verify-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submitCode(code);
      }}
    >
      <div className="field otp-slots-field tfa-slots-field">
        <span className="field-label">{label}</span>
        <CodeSlots
          key={mode}
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
          ariaLabel={label}
          onChange={(next) => {
            setCode(next);
            if (slotStatus === 'error') {
              setSlotStatus('idle');
              setError('');
            }
          }}
          onComplete={(full) => void submitCode(full)}
        />
      </div>
      {error && (
        <p className="pf-error" role="alert">
          {error}
        </p>
      )}
      <div className="tfa-actions">
        <button
          type="submit"
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          disabled={busy || code.length !== 6 || slotStatus === 'success'}
        >
          {busy ? 'Checking…' : submitLabel}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy || slotStatus === 'success'} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <div className="tfa-panel">
      <p className="panel-note">{description}</p>

      <AnimatePresence mode="wait">
        {mode === 'loading' && (
          <motion.div key="loading" className="tfa-stage" {...stageMotion}>
            <p className="field-hint">Checking two-factor status…</p>
          </motion.div>
        )}

        {mode === 'disabled' && (
          <motion.div key="disabled" className="tfa-stage" {...stageMotion}>
            <div className="tfa-status-row">
              <Chip tone="neutral">Off</Chip>
              <span className="field-hint">No authenticator app is linked to this account yet.</span>
            </div>
            {error && (
              <p className="pf-error" role="alert">
                {error}
              </p>
            )}
            <div className="tfa-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || demo}
                onClick={() => void startEnable()}
              >
                {busy ? 'Generating key…' : 'Enable 2FA'}
              </button>
              {demo && <small className="field-hint">Connect to the live server to configure 2FA.</small>}
            </div>
          </motion.div>
        )}

        {(mode === 'setup' || mode === 'rotate-setup') && setup && (
          <motion.div key={mode} className="tfa-stage tfa-setup-stage" {...stageMotion}>
            <div className="tfa-step-head">
              <Chip tone="accent">{mode === 'rotate-setup' ? 'Step 2 of 2' : 'Setup'}</Chip>
              <strong>
                {mode === 'rotate-setup'
                  ? 'Scan your new QR code and confirm'
                  : 'Scan the QR code, then enter the 6-digit code'}
              </strong>
            </div>
            <TotpEnrollCard setup={setup} />
            {renderSlots(
              '6-digit code from your authenticator',
              () => cancelFlow(mode === 'rotate-setup' ? 'enabled' : 'disabled'),
              mode === 'rotate-setup' ? 'Confirm new authenticator' : 'Verify & enable 2FA',
            )}
          </motion.div>
        )}

        {mode === 'enabled' && (
          <motion.div key="enabled" className="tfa-stage" {...stageMotion}>
            <div className="tfa-status-row">
              <Chip tone="success">✓ 2FA enabled</Chip>
              <span className="field-hint">{enabledNote}</span>
            </div>
            <div className="tfa-actions">
              <button
                type="button"
                className="btn"
                disabled={demo}
                onClick={() => enterVerify('verify-rotate')}
              >
                Change authenticator
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={demo}
                onClick={() => enterVerify('verify-disable')}
              >
                Disable 2FA
              </button>
              {demo && <small className="field-hint">Connect to the live server to manage 2FA.</small>}
            </div>
          </motion.div>
        )}

        {mode === 'verify-rotate' && (
          <motion.div key="verify-rotate" className="tfa-stage" {...stageMotion}>
            <div className="tfa-step-head">
              <Chip tone="accent">Step 1 of 2</Chip>
              <strong>Verify your current authenticator</strong>
            </div>
            <p className="field-hint">
              Enter a 6-digit code from your current authenticator app before generating a new setup key. Your
              existing 2FA stays active until the new key is confirmed.
            </p>
            {renderSlots('Current 6-digit code', () => cancelFlow('enabled'), 'Continue')}
          </motion.div>
        )}

        {mode === 'verify-disable' && (
          <motion.div key="verify-disable" className="tfa-stage" {...stageMotion}>
            <div className="tfa-step-head">
              <Chip tone="warn">Confirm removal</Chip>
              <strong>Disable two-factor authentication</strong>
            </div>
            <p className="field-hint">
              Enter a 6-digit code from your authenticator app to confirm disabling 2FA on this account.
            </p>
            {renderSlots('6-digit code to disable 2FA', () => cancelFlow('enabled'), 'Disable 2FA', true)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
