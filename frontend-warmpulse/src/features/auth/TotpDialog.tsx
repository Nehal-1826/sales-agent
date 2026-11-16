import { useEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogBody,
  AppDialogFooter,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { useT } from '@/lib/i18n';
import { TotpField } from './TotpField';

interface TotpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  error?: string | null;
}

/**
 * Modal that fronts the 6-digit TOTP entry after a 2FA-required login.
 *
 * Auto-submits the moment the field is filled to 6 digits — saves the
 * user a click and matches the cadence of the authenticator app
 * (paste / type → instant verify).
 *
 * Outside-click and Escape both cancel the dialog. We do NOT clear the
 * code on cancel so a user who hits Escape can re-open and continue
 * from where they were.
 */
export function TotpDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onSubmit,
  pending,
  error,
}: TotpDialogProps) {
  const t = useT();
  const submittedFor = useRef<string>('');

  // Auto-submit once the user types 6 digits. Guarded with submittedFor so
  // a quick paste can't double-fire while React is mid-render.
  useEffect(() => {
    if (!open) return;
    if (value.length === 6 && /^\d{6}$/.test(value) && submittedFor.current !== value) {
      submittedFor.current = value;
      onSubmit();
    }
  }, [open, value, onSubmit]);

  // Reset the auto-submit guard whenever the dialog opens.
  useEffect(() => {
    if (open) submittedFor.current = '';
  }, [open]);

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        // Don't let the user close the dialog while a verification is in flight.
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <AppDialogContent description={t('auth.totp.description')}>
        <AppDialogHeader>
          <AppDialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent">
              <ShieldCheck className="h-5 w-5" />
            </span>
            {t('auth.totp.title')}
          </AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <p className="text-sm text-text-dim">
            {t('auth.totp.body')}
          </p>
          <div className="pt-2">
            <TotpField
              id="login-totp-modal"
              value={value}
              onChange={onChange}
              autoFocus
              disabled={pending}
            />
          </div>
          {error ? (
            <p className="text-xs text-accent3" role="alert">
              {error}
            </p>
          ) : null}
          <p className="text-xs text-text-dim">
            {t('auth.totp.recoveryText')}
          </p>
        </AppDialogBody>
        <AppDialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t('auth.totp.cancel')}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={pending || value.length !== 6}
          >
            {pending ? t('auth.totp.verifying') : t('auth.totp.verify')}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
