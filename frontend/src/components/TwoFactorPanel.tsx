import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { CodeSlots, type CodeSlotsStatus } from './CodeSlots';
import { toast } from './feedback';
import { Chip } from './ui';
import type { TotpDeviceList, TotpDeviceSetup, TotpSetup } from '../lib/platform';
import type { Result } from '../lib/transport';

export interface TwoFactorApi {
  getStatus: () => Promise<{ enabled: boolean }>;
  setup: () => Promise<Result<TotpSetup>>;
  confirm: (code: string) => Promise<Result<unknown>>;
  disable: (code: string) => Promise<Result<unknown>>;
  rotateStart: (code: string) => Promise<Result<TotpSetup>>;
  rotateConfirm: (code: string) => Promise<Result<unknown>>;
  listDevices: () => Promise<TotpDeviceList>;
  addDevice: (name: string) => Promise<Result<TotpDeviceSetup>>;
  confirmDevice: (id: number, code: string) => Promise<Result<{ ok: boolean }>>;
  removeDevice: (id: number) => Promise<Result<unknown>>;
}

type PanelMode = 'loading' | 'disabled' | 'setup' | 'enabled' | 'verify-rotate' | 'rotate-setup' | 'verify-disable';

/** Inline add-a-device flow state inside the devices card. */
type DeviceFlow = { step: 'name' } | { step: 'enroll'; id: number; name: string; uri: string | null };

const STAGE_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function formatSecret(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/** "Added …" date for a device row (date only — matches the admin tables). */
const deviceDate = (iso: string): string => new Date(iso).toLocaleDateString();

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

  // ── authenticator devices (max 3, QR-only — no raw secrets) ──────────
  const [deviceList, setDeviceList] = useState<TotpDeviceList | null>(null);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlow | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [deviceCode, setDeviceCode] = useState('');
  const [deviceSlotStatus, setDeviceSlotStatus] = useState<CodeSlotsStatus>('idle');
  const [deviceError, setDeviceError] = useState('');
  const [devicesBusy, setDevicesBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  /** QR of a device added this session — kept so "Finish pending setup" can re-show it. */
  const pendingSetup = useRef<TotpDeviceSetup | null>(null);
  const deviceDoneTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(doneTimer.current);
      window.clearTimeout(deviceDoneTimer.current);
    },
    [],
  );

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

  // devices card only exists while 2FA is on; re-fetch on every entry into 'enabled'
  useEffect(() => {
    if (mode !== 'enabled') return;
    let alive = true;
    setDeviceError('');
    api
      .listDevices()
      .then((list) => {
        if (alive) setDeviceList(list);
      })
      .catch(() => {
        if (alive) setDeviceError('Could not load authenticator devices.');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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

  // ── authenticator devices: add / confirm / remove ────────────────────

  function resetDeviceInput() {
    setDeviceCode('');
    setDeviceSlotStatus('idle');
    setDeviceError('');
  }

  async function refreshDevices() {
    setDeviceError('');
    try {
      setDeviceList(await api.listDevices());
    } catch {
      setDeviceError('Could not load authenticator devices.');
    }
  }

  function closeDeviceFlow() {
    window.clearTimeout(deviceDoneTimer.current);
    const wasEnroll = deviceFlow?.step === 'enroll';
    resetDeviceInput();
    setDeviceFlow(null);
    setDeviceName('');
    setConfirmRemoveId(null);
    // a device added but not confirmed stays pending server-side — resurface it
    if (wasEnroll) void refreshDevices();
  }

  async function startAddDevice() {
    if (devicesBusy) return;
    const name = deviceName.trim();
    if (!name) return;
    setDevicesBusy(true);
    setDeviceError('');
    const res = await api.addDevice(name);
    setDevicesBusy(false);
    if (!res.ok) {
      setDeviceError(res.error);
      void refreshDevices(); // the list may be stale (e.g. a pending device appeared)
      return;
    }
    pendingSetup.current = res.data;
    resetDeviceInput();
    setDeviceFlow({ step: 'enroll', id: res.data.id, name: res.data.name, uri: res.data.otpauth_uri });
  }

  /** The Add button turns into this while a pending device exists. */
  function finishPendingSetup() {
    const pending = deviceList?.devices.find((d) => !d.confirmed);
    if (!pending) return;
    const kept = pendingSetup.current?.id === pending.id ? pendingSetup.current : null;
    resetDeviceInput();
    setConfirmRemoveId(null);
    setDeviceFlow({ step: 'enroll', id: pending.id, name: pending.name, uri: kept?.otpauth_uri ?? null });
  }

  async function submitDeviceCode(rawCode: string) {
    if (devicesBusy || deviceSlotStatus === 'success' || rawCode.length !== 6) return;
    if (!deviceFlow || deviceFlow.step !== 'enroll') return;
    setDevicesBusy(true);
    setDeviceError('');
    const res = await api.confirmDevice(deviceFlow.id, rawCode);
    setDevicesBusy(false);
    if (!res.ok) {
      setDeviceSlotStatus('error');
      setDeviceError(res.error);
      return;
    }
    setDeviceSlotStatus('success');
    setDeviceCode('');
    window.clearTimeout(deviceDoneTimer.current);
    deviceDoneTimer.current = window.setTimeout(() => {
      setDeviceSlotStatus('idle');
      pendingSetup.current = null;
      closeDeviceFlow(); // refreshes the list — the flow was open
      toast.success('Authenticator device added.');
    }, reduce ? 120 : 520);
  }

  async function removeDevice(id: number) {
    if (devicesBusy) return;
    setDevicesBusy(true);
    setDeviceError('');
    const res = await api.removeDevice(id);
    setDevicesBusy(false);
    setConfirmRemoveId(null);
    if (!res.ok) {
      setDeviceError(res.error);
      void refreshDevices();
      return;
    }
    if (pendingSetup.current?.id === id) pendingSetup.current = null;
    if (deviceFlow?.step === 'enroll' && deviceFlow.id === id) closeDeviceFlow(); // refreshes
    else void refreshDevices();
    toast.success('Authenticator device removed.');
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

  const pendingDevice = deviceList?.devices.find((d) => !d.confirmed) ?? null;

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

      {mode === 'enabled' && (
        <div className="tfa-enroll-card">
          <div className="tfa-device-row">
            <strong>Authenticator devices</strong>
            {deviceList && (
              <Chip tone={deviceList.remaining > 0 ? 'neutral' : 'warn'}>
                {deviceList.remaining > 0 ? `${deviceList.remaining} of 3 slots free` : 'Device limit reached'}
              </Chip>
            )}
          </div>

          {deviceError && (
            <p className="pf-error" role="alert">
              {deviceError}
            </p>
          )}

          {deviceFlow?.step === 'name' && (
            <form
              className="tfa-verify-form"
              onSubmit={(e) => {
                e.preventDefault();
                void startAddDevice();
              }}
            >
              <div className="field">
                <span className="field-label">Device name</span>
                <input
                  value={deviceName}
                  maxLength={60}
                  required
                  autoFocus
                  placeholder="e.g. iPhone"
                  aria-label="Device name"
                  onChange={(e) => setDeviceName(e.target.value)}
                />
                <small className="field-hint">Label this device so you know which phone or app it is.</small>
              </div>
              <div className="tfa-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={devicesBusy || deviceName.trim().length === 0}
                >
                  {devicesBusy ? 'Creating…' : 'Continue'}
                </button>
                <button type="button" className="btn btn-ghost" disabled={devicesBusy} onClick={closeDeviceFlow}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {deviceFlow?.step === 'enroll' && (
            <>
              <div className="tfa-step-head">
                <Chip tone="accent">Setup</Chip>
                <strong>
                  {deviceFlow.uri
                    ? `Scan the QR for “${deviceFlow.name}”, then enter its 6-digit code`
                    : `Enter the 6-digit code for “${deviceFlow.name}”`}
                </strong>
              </div>
              {deviceFlow.uri ? (
                <div className="tfa-qr-wrap">
                  <div className="tfa-qr-box">
                    <QRCodeSVG value={deviceFlow.uri} size={168} level="M" marginSize={2} />
                  </div>
                  <small className="field-hint">
                    Scan with Google Authenticator, Authy, 1Password, or Microsoft Authenticator.
                  </small>
                </div>
              ) : (
                <p className="field-hint">
                  The QR is only shown when a device is added. Lost it? Cancel, remove the pending device, then add
                  it again for a fresh QR.
                </p>
              )}
              <form
                className="tfa-verify-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitDeviceCode(deviceCode);
                }}
              >
                <div className="field otp-slots-field tfa-slots-field">
                  <span className="field-label">6-digit code from the new device</span>
                  <CodeSlots
                    key={deviceFlow.id}
                    length={6}
                    value={deviceCode}
                    status={deviceSlotStatus}
                    disabled={devicesBusy}
                    slotSize={compactSlots ? 38 : 49}
                    gap={compactSlots ? 6 : 10}
                    accentColor="#f97316"
                    inkColor="#ffffff"
                    slotColor="rgba(255, 255, 255, 0.08)"
                    digitColor="#f5f2ed"
                    dangerColor="#f87171"
                    autoFocus
                    ariaLabel="6-digit code from the new device"
                    onChange={(next) => {
                      setDeviceCode(next);
                      if (deviceSlotStatus === 'error') {
                        setDeviceSlotStatus('idle');
                        setDeviceError('');
                      }
                    }}
                    onComplete={(full) => void submitDeviceCode(full)}
                  />
                </div>
                <div className="tfa-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={devicesBusy || deviceCode.length !== 6 || deviceSlotStatus === 'success'}
                  >
                    {devicesBusy ? 'Checking…' : 'Confirm device'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={devicesBusy || deviceSlotStatus === 'success'}
                    onClick={closeDeviceFlow}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </>
          )}

          {!deviceFlow && (
            <>
              <p className="field-hint">Up to 3 authenticator devices — any device’s 6-digit code works at sign-in.</p>
              {!deviceList && !deviceError && <p className="field-hint">Loading devices…</p>}
              {deviceList && (
                <div className="tfa-devices-list">
                  {deviceList.primary && (
                    <div className="tfa-device-row" title="Rotate or disable via the buttons above">
                      <div>
                        <strong>Primary</strong> <Chip tone="neutral">Built-in</Chip>
                        <small className="field-hint">Set up when 2FA was enabled</small>
                      </div>
                    </div>
                  )}
                  {deviceList.devices.map((d) => (
                    <div className="tfa-device-row" key={d.id}>
                      <div>
                        <strong>{d.name}</strong>
                        {!d.confirmed && (
                          <>
                            {' '}
                            <Chip tone="warn">Pending setup</Chip>
                          </>
                        )}
                        <small className="field-hint">
                          Added {deviceDate(d.created_at)} · Last used{' '}
                          {d.last_used_at ? deviceDate(d.last_used_at) : 'Never'}
                        </small>
                      </div>
                      <button
                        type="button"
                        className={`btn btn-sm ${confirmRemoveId === d.id ? 'btn-danger' : 'btn-ghost'}`}
                        disabled={devicesBusy}
                        onClick={() =>
                          confirmRemoveId === d.id ? void removeDevice(d.id) : setConfirmRemoveId(d.id)
                        }
                      >
                        {confirmRemoveId === d.id ? 'Really remove?' : 'Remove'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="tfa-actions">
                {pendingDevice ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={devicesBusy}
                    onClick={finishPendingSetup}
                  >
                    Finish pending setup
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={devicesBusy || (deviceList?.remaining ?? 3) <= 0}
                    onClick={() => {
                      setConfirmRemoveId(null);
                      setDeviceName('');
                      setDeviceError('');
                      setDeviceFlow({ step: 'name' });
                    }}
                  >
                    Add device
                  </button>
                )}
                {demo && <small className="field-hint">Connect to the live server to manage devices.</small>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
