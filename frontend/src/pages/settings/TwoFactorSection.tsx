import { useMemo } from 'react';
import { TwoFactorPanel, type TwoFactorApi } from '../../components/TwoFactorPanel';
import {
  addUserTotpDevice,
  confirmUser2fa,
  confirmUserTotpDevice,
  disableUser2fa,
  getUser2faStatus,
  isDemo,
  listUserTotpDevices,
  removeUserTotpDevice,
  rotateUser2faConfirm,
  rotateUser2faStart,
  setupUser2fa,
} from '../../lib/api';

/**
 * TWO-FACTOR — workspace users manage their own TOTP from Settings.
 * Uses the same spring-animated CodeSlots + QR flow as the sign-in OTP screen.
 */
export function TwoFactorSection() {
  const demo = isDemo();
  const api = useMemo<TwoFactorApi>(
    () => ({
      getStatus: getUser2faStatus,
      setup: setupUser2fa,
      confirm: confirmUser2fa,
      disable: disableUser2fa,
      rotateStart: rotateUser2faStart,
      rotateConfirm: rotateUser2faConfirm,
      listDevices: listUserTotpDevices,
      addDevice: addUserTotpDevice,
      confirmDevice: confirmUserTotpDevice,
      removeDevice: removeUserTotpDevice,
    }),
    [],
  );

  return (
    <section className="panel settings-panel" aria-labelledby="sec-twofactor">
      <h2 id="sec-twofactor" className="section-title">
        Two-factor authentication
      </h2>
      <TwoFactorPanel
        api={api}
        demo={demo}
        description="Add a second layer of security to your account. Every sign-in will ask for a 6-digit code from your authenticator app (Google Authenticator, Authy, 1Password)."
        enabledNote="Your account is protected. Every new sign-in will prompt for a 6-digit code."
      />
    </section>
  );
}
