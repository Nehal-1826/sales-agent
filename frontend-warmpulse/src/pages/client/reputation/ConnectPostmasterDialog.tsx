/**
 * Dialog for connecting a Google Postmaster Tools domain.
 *
 * Flow:
 *  1. User types the domain they've already verified inside Postmaster
 *     Tools (e.g. ``acme.com``) and clicks "Connect Google".
 *  2. ``useStartPostmasterConnect`` requests an auth URL from the backend
 *     and opens it in a centred popup.
 *  3. After Google's consent screen, the backend's oauth-callback writes
 *     the credential and redirects the popup to
 *     ``/app/reputation?postmaster=connected`` — the popup may also post
 *     ``postmaster_connected`` back to the opener; we listen and
 *     invalidate the domain-reputation query so the card flips state.
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useStartPostmasterConnect } from '@/features/reputation/api';

export interface ConnectPostmasterDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function ConnectPostmasterDialog({ open, onOpenChange }: ConnectPostmasterDialogProps) {
  const [domain, setDomain] = useState('');
  const qc = useQueryClient();
  const start = useStartPostmasterConnect();

  const trimmed = domain.trim().toLowerCase();
  const valid = trimmed.length > 0 && DOMAIN_RE.test(trimmed);

  useEffect(() => {
    if (!open) return;
    function onMessage(ev: MessageEvent) {
      if (ev?.data === 'postmaster_connected' || ev?.data?.type === 'postmaster_connected') {
        qc.invalidateQueries({ queryKey: ['reputation', 'domain-reputation'] });
        onOpenChange(false);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, qc, onOpenChange]);

  function handleConnect() {
    if (!valid || start.isPending) return;
    start.mutate(trimmed);
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Connect Google Postmaster</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
            <p style={{ fontSize: 13, color: 'var(--wp-text-dim)', margin: '0 0 12px' }}>
              Enter a domain you've already verified inside{' '}
              <a
                href="https://postmaster.google.com"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--wp-accent)' }}
              >
                Google Postmaster Tools
              </a>
              . We'll open a Google consent popup so you can grant read-only
              access to its traffic stats.
            </p>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Domain</label>
            <Input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="acme.com"
              autoFocus
              invalid={domain.length > 0 && !valid}
            />
            {start.isError && (
              <p style={{ color: 'var(--wp-accent3)', fontSize: 12, marginTop: 8 }}>
                Could not start the OAuth flow. Try again.
              </p>
            )}
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConnect}
              disabled={!valid || start.isPending}
            >
              {start.isPending ? 'Opening…' : 'Connect Google'}
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
    </AppDialog>
  );
}

export default ConnectPostmasterDialog;
