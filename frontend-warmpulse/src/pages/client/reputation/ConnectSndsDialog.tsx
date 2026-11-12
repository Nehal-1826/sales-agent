/**
 * Dialog for connecting a Microsoft SNDS access key.
 *
 * Microsoft does not offer OAuth for SNDS — instead, the user generates
 * an access key at https://postmaster.live.com and pastes it here. We
 * validate the key by attempting one CSV fetch backend-side; on success
 * the credential is encrypted-at-rest and persisted.
 */
import { useState } from 'react';
import { AxiosError } from 'axios';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/AppToast';
import { useConnectSnds } from '@/features/reputation/api';

export interface ConnectSndsDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function ConnectSndsDialog({ open, onOpenChange }: ConnectSndsDialogProps) {
  const [domain, setDomain] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const connect = useConnectSnds();

  const trimmedDomain = domain.trim().toLowerCase();
  const trimmedKey = accessKey.trim();
  const validDomain = trimmedDomain.length > 0 && DOMAIN_RE.test(trimmedDomain);
  const validKey = trimmedKey.length >= 8;
  const canSubmit = validDomain && validKey && !connect.isPending;

  function handleConnect() {
    if (!canSubmit) return;
    setErrorText(null);
    connect.mutate(
      { domain: trimmedDomain, access_key: trimmedKey },
      {
        onSuccess: () => {
          toast.success('Microsoft SNDS connected — first pull lands at 03:30 UTC.');
          setDomain('');
          setAccessKey('');
          onOpenChange(false);
        },
        onError: (err) => {
          let msg = 'Invalid SNDS access key — verify it at postmaster.live.com';
          if (err instanceof AxiosError) {
            const status = err.response?.status;
            const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
            if (status && status !== 400 && detail) {
              msg = detail;
            }
          }
          setErrorText(msg);
        },
      },
    );
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Connect Microsoft SNDS</AppDialogTitle>
          </AppDialogHeader>
          <AppDialogBody>
            <p style={{ fontSize: 13, color: 'var(--wp-text-dim)', margin: '0 0 12px' }}>
              Paste the access key you generated at{' '}
              <a
                href="https://postmaster.live.com"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--wp-accent)' }}
              >
                postmaster.live.com
              </a>
              . We'll verify it by pulling one CSV before saving.
            </p>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Domain</label>
            <Input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="acme.com"
              autoFocus
              invalid={domain.length > 0 && !validDomain}
            />
            <label style={{ display: 'block', fontSize: 12, margin: '12px 0 4px' }}>
              Access key
            </label>
            <Input
              type="password"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="Your SNDS access key"
              invalid={accessKey.length > 0 && !validKey}
              autoComplete="off"
            />
            {errorText && (
              <p style={{ color: 'var(--wp-accent3)', fontSize: 12, marginTop: 8 }}>
                {errorText}
              </p>
            )}
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConnect} disabled={!canSubmit}>
              {connect.isPending ? 'Verifying…' : 'Connect'}
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

export default ConnectSndsDialog;
