/**
 * Admin mailbox-transfer dialog — move one mailbox (with its warmup state)
 * from the user who connected it to another client user's workspace.
 * Example story: a mailbox connected under a personal account (dvshrrd) that
 * belongs to the business account (info@ijrnexus) gets moved there.
 *
 * Super-admin only (backend enforces); every transfer is audited server-side
 * as `mailbox.transferred`.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Inbox, Loader2, Search, User } from 'lucide-react';

import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { toast } from '@/components/ui/AppToast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { extractErrorMessage } from '@/lib/errors';
import {
  useAdminMailboxes,
  useAdminTransferMailbox,
  useAdminUsers,
  type AdminMailboxRow,
} from '@/features/admin/api';

interface TransferMailboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransferMailboxDialog({ open, onOpenChange }: TransferMailboxDialogProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [mailbox, setMailbox] = useState<AdminMailboxRow | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [searchTouched, setSearchTouched] = useState(false);

  // Debounce-free but cheap: only hit the API once the search settles a bit.
  const effectiveSearch = useMemo(() => {
    if (!searchTouched) return null;
    const q = search.trim();
    return q.length >= 2 ? q : null;
  }, [search, searchTouched]);

  const mailboxes = useAdminMailboxes(open ? effectiveSearch : null);
  const users = useAdminUsers({ page: 1, page_size: 200 });
  const transfer = useAdminTransferMailbox();

  const clientUsers = useMemo(
    () => (users.data?.items ?? []).filter((u) => u.role !== 'super_admin'),
    [users.data],
  );
  const targets = useMemo(
    () => clientUsers.filter((u) => u.id !== mailbox?.owner_user_id),
    [clientUsers, mailbox],
  );

  const close = (next: boolean) => {
    if (!next) {
      setMailbox(null);
      setTargetId(null);
      setSearch('');
      setSearchTouched(false);
    }
    onOpenChange(next);
  };

  const run = () => {
    if (!mailbox || !targetId || transfer.isPending) return;
    transfer.mutate(
      { mailboxId: mailbox.id, targetUserId: targetId },
      {
        onSuccess: (res) => {
          toast.success(`${res.email_address} transferred to ${res.new_owner_email}.`);
          qc.invalidateQueries();
          close(false);
        },
        onError: (err) => {
          toast.error(extractErrorMessage(err, 'Transfer failed.'));
        },
      },
    );
  };

  const rows = mailboxes.data ?? [];

  return (
    <AppDialog open={open} onOpenChange={close}>
      <AppDialogContent className="max-w-2xl">
        <AppDialogHeader>
          <AppDialogTitle>Transfer mailbox</AppDialogTitle>
          <AppDialogDescription>
            Move a mailbox — with its warmup progress — to another client user&apos;s
            workspace. Audited; only client users can receive mailboxes.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="space-y-4">
            {/* Step 1 — pick the mailbox */}
            <div className="space-y-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-dim">
                1 · Mailbox to transfer
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSearchTouched(true);
                  }}
                  placeholder="Search mailbox or current owner…"
                  className="pl-8"
                />
              </div>
              <div className="max-h-52 overflow-y-auto rounded-lg border border-border-muted">
                {mailboxes.isLoading ? (
                  <p className="flex items-center gap-2 px-3 py-4 text-xs text-text-dim">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading mailboxes…
                  </p>
                ) : rows.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-text-dim">
                    {effectiveSearch
                      ? 'No mailboxes match that search.'
                      : 'No client mailboxes exist yet.'}
                  </p>
                ) : (
                  rows.map((m) => {
                    const selected = mailbox?.id === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setMailbox(m);
                          if (targetId === m.owner_user_id) setTargetId(null);
                        }}
                        className={`flex w-full items-center gap-3 border-b border-border-muted px-3 py-2 text-left last:border-b-0 transition-colors ${
                          selected ? 'bg-accent/10' : 'hover:bg-surface-2/70'
                        }`}
                      >
                        <Inbox
                          className={`h-4 w-4 flex-none ${
                            selected ? 'text-accent' : 'text-text-faint'
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-text">
                            {m.email_address}
                          </span>
                          <span className="block truncate text-xs text-text-dim">
                            owner: {m.owner_email} · {m.provider}
                          </span>
                        </span>
                        <Badge variant={m.warmup_status === 'active' ? 'green' : 'orange'}>
                          {m.is_paused ? 'paused' : m.warmup_status}
                        </Badge>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Step 2 — destination */}
            <div className="space-y-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-dim">
                2 · Transfer to
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border-muted">
                {mailbox == null ? (
                  <p className="px-3 py-4 text-xs text-text-dim">
                    Pick a mailbox first.
                  </p>
                ) : targets.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-text-dim">No other client users.</p>
                ) : (
                  targets.map((u) => {
                    const selected = targetId === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setTargetId(u.id)}
                        className={`flex w-full items-center gap-3 border-b border-border-muted px-3 py-2 text-left last:border-b-0 transition-colors ${
                          selected ? 'bg-accent/10' : 'hover:bg-surface-2/70'
                        }`}
                      >
                        <User
                          className={`h-4 w-4 flex-none ${
                            selected ? 'text-accent' : 'text-text-faint'
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-text">{u.email}</span>
                          <span className="block truncate text-xs text-text-dim">
                            {u.plan ?? 'no plan'} · {u.mailbox_count} mailbox
                            {u.mailbox_count === 1 ? '' : 'es'}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Summary + action */}
            {mailbox && targetId ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2/50 px-3 py-2.5 text-xs text-text">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold">{mailbox.email_address}</span>
                  <ArrowRight className="h-3.5 w-3.5 flex-none text-accent" />
                  <span className="truncate font-semibold">
                    {targets.find((t) => t.id === targetId)?.email}
                  </span>
                </span>
                <Button size="sm" onClick={run} disabled={transfer.isPending}>
                  {transfer.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    'Transfer'
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        </AppDialogBody>
      </AppDialogContent>
    </AppDialog>
  );
}
