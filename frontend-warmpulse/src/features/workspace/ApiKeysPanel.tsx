import { useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Plus, Shield, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { confirm } from '@/components/ui/ConfirmDialog';
import { extractErrorMessage } from '@/lib/errors';
import { formatDate as _fmtDate } from '@/lib/format';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { toast } from '@/components/ui/AppToast';
import {
  useCreateApiKey,
  useRevokeApiKey,
  useWorkspace,
  type ApiKey,
  type CreateApiKeyResponse,
} from './api';

export function ApiKeysPanel() {
  const { data, isLoading, isError } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<CreateApiKeyResponse | null>(null);

  const isAgency = data?.plan === 'agency';

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 py-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return <EmptyState title="Couldn't load API keys" description="Try refreshing." />;
  }

  if (!isAgency) {
    return (
      <EmptyState
        icon={<KeyRound className="h-5 w-5" />}
        title="API keys are an Agency feature"
        description="Upgrade to the Agency plan to programmatically manage mailboxes, reports, and sub-clients."
        action={
          <Button variant="secondary" asChild>
            <a href="/app/billing">Upgrade plan</a>
          </Button>
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>API keys</CardTitle>
            <CardDescription>
              Programmatic access to the WarmPulse API. Keys are shown once on creation — store them safely.
            </CardDescription>
          </div>
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setCreateOpen(true)}
          >
            New key
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!data?.api_keys.length ? (
          <div className="p-5">
            <EmptyState
              icon={<Shield className="h-5 w-5" />}
              title="No API keys yet"
              description="Create a key to start using the WarmPulse API from scripts or integrations."
              action={
                <Button
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => setCreateOpen(true)}
                >
                  Create API key
                </Button>
              }
            />
          </div>
        ) : (
          <KeysTable keys={data.api_keys} />
        )}
      </CardContent>

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={(v) => setCreateOpen(v)}
        onCreated={setRevealedKey}
      />
      <RevealKeyDialog
        payload={revealedKey}
        onClose={() => setRevealedKey(null)}
      />
    </Card>
  );
}

function KeysTable({ keys }: { keys: ApiKey[] }) {
  const revoke = useRevokeApiKey();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead className="bg-surface-2/50">
          <tr className="text-left text-xs font-medium uppercase tracking-wider text-text-dim">
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Key</th>
            <th className="px-4 py-2">Created</th>
            <th className="px-4 py-2">Last used</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {keys.map((k) => (
            <tr key={k.id} className="text-sm">
              <td className="px-4 py-2 font-medium">{k.name}</td>
              <td className="px-4 py-2">
                <code className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs">
                  {k.key_hash_prefix}…
                </code>
              </td>
              <td className="px-4 py-2 tabular-nums text-text-dim">{formatDate(k.created_at)}</td>
              <td className="px-4 py-2 tabular-nums text-text-dim">
                {k.last_used_at ? formatDate(k.last_used_at) : '—'}
              </td>
              <td className="px-4 py-2">
                {k.revoked_at ? (
                  <Badge variant="orange">Revoked</Badge>
                ) : (
                  <Badge variant="green">Active</Badge>
                )}
              </td>
              <td className="px-4 py-2 text-right">
                {k.revoked_at ? (
                  <span className="text-xs text-text-dim">—</span>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Revoke API key?',
                        description: `"${k.name}" stops authenticating immediately. Applications using it will start getting 401s.`,
                        confirmLabel: 'Revoke',
                        danger: true,
                      });
                      if (!ok) return;
                      revoke.mutate(k.id, {
                        onSuccess: () => toast.success('Key revoked'),
                        onError: (err) =>
                          toast.error(extractErrorMessage(err, 'Failed to revoke')),
                      });
                    }}
                    aria-label={`Revoke ${k.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (key: CreateApiKeyResponse) => void;
}) {
  const [name, setName] = useState('');
  const create = useCreateApiKey();

  const reset = () => {
    setName('');
    create.reset();
  };
  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim() },
      {
        onSuccess: (data) => {
          onCreated(data);
          handleClose(false);
        },
        onError: () => toast.error('Failed to create key'),
      },
    );
  };

  return (
    <AppDialog open={open} onOpenChange={handleClose}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>New API key</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <FormField
            label="Name"
            htmlFor="key-name"
            required
            hint="Give it a memorable label, e.g. 'CI pipeline' or 'Mobile app'."
          >
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CI pipeline"
            />
          </FormField>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={create.isPending || !name.trim()}
            leftIcon={create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {create.isPending ? 'Creating…' : 'Create key'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function RevealKeyDialog({
  payload,
  onClose,
}: {
  payload: CreateApiKeyResponse | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!payload) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(payload.key).then(
        () => {
          setCopied(true);
          toast.success('Copied to clipboard');
          setTimeout(() => setCopied(false), 2000);
        },
        () => toast.error('Failed to copy'),
      );
    }
  };

  return (
    <AppDialog open={!!payload} onOpenChange={(v) => !v && onClose()}>
      <AppDialogContent showClose={false}>
        <AppDialogHeader>
          <AppDialogTitle>Your API key — copy it now</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="rounded-lg border border-accent3/40 bg-accent3/5 p-3 text-xs text-accent3">
            This is the only time we'll show the full key. Save it somewhere safe — you won't be able to see it again.
          </div>
          {payload ? (
            <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2/40 p-3">
              <code className="flex-1 break-all font-mono text-sm text-text">
                {payload.key}
              </code>
              <Button variant="secondary" size="sm" onClick={copy}>
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          ) : null}
        </AppDialogBody>
        <AppDialogFooter>
          <Button onClick={onClose}>I've saved it, dismiss</Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function formatDate(iso: string): string {
  try {
    return _fmtDate(iso);
  } catch {
    return iso;
  }
}
