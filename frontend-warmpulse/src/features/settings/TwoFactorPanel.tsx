/**
 * TwoFactorPanel — self-contained TOTP enable/verify/disable control.
 *
 * Uses the verified-working settings TOTP hooks (POST /workspace/settings/
 * security/totp/{enroll,verify,disable}). Dropped into the admin Settings
 * Security card so a super_admin can actually turn on 2FA (the card was
 * previously display-only). Dark-card styling via inline styles.
 */
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, Loader2, Copy } from 'lucide-react';
import {
  useUserSettings,
  useEnableTotp,
  useVerifyTotp,
  useDisableTotp,
  type TotpEnrollment,
} from '@/features/settings/api';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';

const ACCENT = '#F26522';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
  padding: 16,
};
const btn = (variant: 'primary' | 'ghost'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 16px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  border: variant === 'primary' ? 'none' : '1px solid rgba(255,255,255,0.14)',
  background: variant === 'primary' ? `linear-gradient(135deg, ${ACCENT}, #FF8A4B)` : 'rgba(255,255,255,0.06)',
  color: variant === 'primary' ? '#fff' : 'rgba(255,255,255,0.85)',
});
const input: React.CSSProperties = {
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: '#fff',
  padding: '8px 12px',
  fontSize: 14,
  outline: 'none',
};

export function TwoFactorPanel() {
  const settings = useUserSettings();
  const enrol = useEnableTotp();
  const verify = useVerifyTotp();
  const disable = useDisableTotp();

  const enabled = settings.data?.security.totp_enabled ?? false;
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const startEnrol = async () => {
    try {
      const data = await enrol.mutateAsync();
      setEnrollment(data);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not start 2FA setup.'));
    }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error('Enter the 6-digit code from your authenticator.');
      return;
    }
    try {
      await verify.mutateAsync({ code: code.trim() });
      setEnrollment(null);
      setCode('');
      toast.success('Two-factor authentication enabled.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Invalid code — try again.'));
    }
  };

  const turnOff = async () => {
    if (!password) {
      toast.error('Enter your password to disable 2FA.');
      return;
    }
    try {
      await disable.mutateAsync({ password });
      setPassword('');
      toast.success('Two-factor authentication disabled.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not disable 2FA.'));
    }
  };

  // ── Already on ──
  if (enabled) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <ShieldCheck size={16} color={ACCENT} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
            Two-factor authentication is ON
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '0 0 12px' }}>
          You're asked for a 6-digit code on every email/password sign-in.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...input, flex: 1, minWidth: 180 }} type="password" placeholder="Confirm password to disable"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <button style={btn('ghost')} onClick={turnOff} disabled={disable.isPending}>
            {disable.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Disable 2FA'}
          </button>
        </div>
      </div>
    );
  }

  // ── Enrolling ──
  if (enrollment) {
    return (
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
          Scan with your authenticator app
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ background: '#fff', padding: 10, borderRadius: 10 }}>
            <QRCodeSVG value={enrollment.qr_url} size={132} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
              Or enter this secret manually:
            </div>
            <code style={{ display: 'block', fontSize: 13, color: ACCENT, wordBreak: 'break-all', marginBottom: 12 }}>
              {enrollment.secret}
            </code>
            {enrollment.recovery_codes.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                  Recovery codes (save these)
                  <button
                    style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    onClick={() => { void navigator.clipboard.writeText(enrollment.recovery_codes.join('\n')); toast.success('Copied'); }}
                  >
                    <Copy size={11} /> copy
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                  {enrollment.recovery_codes.map((c) => <span key={c}>{c}</span>)}
                </div>
              </div>
            )}
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
              Enter a code to confirm:
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...input, width: 120, letterSpacing: 4, textAlign: 'center' }}
                inputMode="numeric" maxLength={6} placeholder="000000"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <button style={btn('primary')} onClick={confirm} disabled={verify.isPending || code.trim().length < 6}>
                {verify.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Verify & enable'}
              </button>
              <button style={btn('ghost')} onClick={() => { setEnrollment(null); setCode(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Off (default) ──
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Two-factor authentication</div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '4px 0 0' }}>
            Add a 6-digit authenticator code to your sign-in.
          </p>
        </div>
        <button style={btn('primary')} onClick={startEnrol} disabled={enrol.isPending}>
          {enrol.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Enable 2FA'}
        </button>
      </div>
    </div>
  );
}
