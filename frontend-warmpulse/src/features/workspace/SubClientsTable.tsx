import { useState } from 'react';
import { Layers, Loader2, Plus, Trash2 } from 'lucide-react';
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
  useCreateSubClient,
  useDeleteSubClient,
  useWorkspace,
  type SubClient,
} from './api';

export function SubClientsTable() {
  const { data, isLoading, isError } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);

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
    return (
      <EmptyState
        title="Couldn't load sub-clients"
        description="Try refreshing."
      />
    );
  }

  if (!isAgency) {
    return (
      <EmptyState
        icon={<Layers className="h-5 w-5" />}
        title="Sub-clients are an Agency feature"
        description="Upgrade to the Agency plan to manage multiple client workspaces from a single dashboard."
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
            <CardTitle>Sub-clients</CardTitle>
            <CardDescription>
              Manage separate client workspaces that roll up under this agency.
            </CardDescription>
          </div>
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setCreateOpen(true)}
          >
            New sub-client
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!data?.sub_clients.length ? (
          <div className="p-5">
            <EmptyState
              icon={<Layers className="h-5 w-5" />}
              title="No sub-clients yet"
              description="Add your first client to segment their mailboxes, reports, and billing."
              action={
                <Button
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => setCreateOpen(true)}
                >
                  Create sub-client
                </Button>
              }
            />
          </div>
        ) : (
          <SubClientTable subClients={data.sub_clients} />
        )}
      </CardContent>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Card>
  );
}

function SubClientTable({ subClients }: { subClients: SubClient[] }) {
  const remove = useDeleteSubClient();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead className="bg-surface-2/50">
          <tr className="text-left text-xs font-medium uppercase tracking-wider text-text-dim">
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Owner email</th>
            <th className="px-4 py-2">Mailboxes</th>
            <th className="px-4 py-2">Created</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {subClients.map((s) => (
            <tr key={s.id} className="text-sm">
              <td className="px-4 py-2 font-medium">{s.name}</td>
              <td className="px-4 py-2 text-text-dim">{s.owner_email}</td>
              <td className="px-4 py-2 tabular-nums">{s.mailbox_count}</td>
              <td className="px-4 py-2 tabular-nums text-text-dim">
                {formatDate(s.created_at)}
              </td>
              <td className="px-4 py-2 text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete sub-client?',
                      description: `"${s.name}" will be removed and their mailboxes paused. This cannot be undone.`,
                      confirmLabel: 'Delete',
                      danger: true,
                    });
                    if (!ok) return;
                    remove.mutate(s.id, {
                      onSuccess: () => toast.success('Sub-client deleted'),
                      onError: (err) =>
                        toast.error(extractErrorMessage(err, 'Failed to delete')),
                    });
                  }}
                  aria-label={`Delete ${s.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const create = useCreateSubClient();

  const reset = () => {
    setName('');
    setEmail('');
    create.reset();
  };
  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = () => {
    if (!name || !email.includes('@')) return;
    create.mutate(
      { name, owner_email: email },
      {
        onSuccess: () => {
          toast.success('Sub-client created');
          handleClose(false);
        },
        onError: () => toast.error('Failed to create sub-client'),
      },
    );
  };

  return (
    <AppDialog open={open} onOpenChange={handleClose}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>New sub-client</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <FormField label="Client name" htmlFor="sc-name" required>
            <Input
              id="sc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme, Inc."
            />
          </FormField>
          <FormField
            label="Owner email"
            htmlFor="sc-email"
            required
            hint="They'll get a welcome email with login instructions."
          >
            <Input
              id="sc-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@acme.com"
            />
          </FormField>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={create.isPending || !name || !email.includes('@')}
            leftIcon={create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {create.isPending ? 'Creating…' : 'Create sub-client'}
          </Button>
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
