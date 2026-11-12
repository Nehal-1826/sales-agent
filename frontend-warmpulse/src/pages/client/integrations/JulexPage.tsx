import { useState } from 'react';
import { ExternalLink, Loader2, Plug } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { confirm } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/AppToast';
import {
  julexVerifyErrorMessage,
  useDisconnectJulex,
  useJulexLink,
  useVerifyJulex,
} from '@/features/integrations/api';
import { formatDate } from '@/lib/format';

/**
 * /app/integrations/julex — single shared page for every plan tier
 * (integrations are plan-agnostic). Two states, both driven by the
 * ['julex-link'] query:
 *
 *   disconnected → explainer + paste-a-key verify form
 *   connected    → status chip + store details + disconnect
 */

/** Pull a pk_live_… token out of arbitrary pasted text (URLs, snippets). */
const PK_LIVE_RE = /pk_live_[A-Za-z0-9_-]+/;

export function JulexPage() {
  const link = useJulexLink();
  const verify = useVerifyJulex();
  const disconnect = useDisconnectJulex();
  const [keyInput, setKeyInput] = useState('');

  const onVerify = () => {
    const raw = keyInput.trim();
    if (!raw) return;
    const match = PK_LIVE_RE.exec(raw);
    verify.mutate(
      { store_key: match ? match[0] : raw },
      {
        onSuccess: (res) => {
          setKeyInput('');
          toast.success(`Julex store “${res.store_name}” linked.`);
        },
      },
    );
  };

  const onDisconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect Julex store?',
      description:
        'Your workspace will no longer be linked to this Julex store. You can re-link anytime with the same key.',
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (!ok) return;
    disconnect.mutate(undefined, {
      onSuccess: () => toast.success('Julex store disconnected.'),
      onError: () => toast.error('Could not disconnect — try again.'),
    });
  };

  const status = link.data;
  const connected = !!status?.connected;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-text">
          <Plug className="h-5 w-5 text-accent" />
          Integrations
        </h1>
        <p className="text-sm text-text-dim">
          Connect WarmPulse to the tools your outreach runs on.
        </p>
      </header>

      <Card noShimmer>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle>Julex</CardTitle>
              {link.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-text-dim" />
              ) : connected ? (
                <Badge variant="green">Connected</Badge>
              ) : (
                <Badge variant="neutral">Not connected</Badge>
              )}
            </div>
            {connected ? (
              <a
                href="https://julex.shop"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                Open your Julex admin
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          <CardDescription>
            Link your Julex store to sync warmup intelligence with your storefront.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connected && status ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-text-dim">Store</dt>
                  <dd className="mt-1 text-sm font-medium text-text">
                    {status.store_name ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-text-dim">Store key</dt>
                  <dd className="mt-1 font-mono text-sm text-text">
                    {status.store_key_masked ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-text-dim">Connected</dt>
                  <dd className="mt-1 text-sm text-text">
                    {status.connected_at ? formatDate(status.connected_at) : '—'}
                  </dd>
                </div>
              </dl>
              <div className="flex items-center justify-between gap-3 border-t border-border-muted pt-4">
                <p className="text-xs text-text-dim">
                  Disconnecting stops all Julex syncs immediately.
                </p>
                <Button
                  variant="danger"
                  disabled={disconnect.isPending}
                  isLoading={disconnect.isPending}
                  onClick={() => void onDisconnect()}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-text-dim">
                Paste the store key from your Julex admin (Settings → API keys). It
                looks like <code className="rounded bg-surface-2 px-1 py-0.5 text-xs text-text">pk_live_…</code> —
                pasting the whole line or a snippet around it works too.
              </p>
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-start"
                onSubmit={(e) => {
                  e.preventDefault();
                  onVerify();
                }}
              >
                <div className="flex-1">
                  <FormField label="Store key" htmlFor="julex-key" required>
                    <Input
                      id="julex-key"
                      placeholder="pk_live_…"
                      autoComplete="off"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                    />
                  </FormField>
                </div>
                <Button
                  type="submit"
                  className="sm:mt-6"
                  disabled={!keyInput.trim() || verify.isPending}
                  leftIcon={verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
                >
                  {verify.isPending ? 'Verifying…' : 'Verify'}
                </Button>
              </form>
              {verify.isError ? (
                <p className="text-xs text-accent3">{julexVerifyErrorMessage(verify.error)}</p>
              ) : null}
              {link.isError ? (
                <p className="text-xs text-accent3">
                  Could not load your integration status. Refresh the page.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default JulexPage;
