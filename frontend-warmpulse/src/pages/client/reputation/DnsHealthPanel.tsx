import { useState } from 'react';
import { Check, RefreshCw, X, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/AppToast';
import { useDnsCheck, useMailboxes } from '@/features/mailboxes/api';
import type { Mailbox } from '@/features/mailboxes/types';

interface DnsHealthPanelProps {
  /** Called when all rechecks complete — lets the parent refresh dependent queries. */
  onRecheckComplete?: () => void;
}

function PillIcon({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-accent"
        title="Valid"
      >
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent3/15 text-accent3"
        title="Invalid"
      >
        <X className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-muted bg-surface-2 text-text-dim"
      title="Unknown"
    >
      <HelpCircle className="h-3.5 w-3.5" />
    </span>
  );
}

function Row({ mailbox }: { mailbox: Mailbox }) {
  return (
    <tr className="border-b border-border-muted/60 last:border-b-0">
      <td className="px-3 py-2.5">
        <p className="truncate font-mono text-xs text-text" title={mailbox.email_address}>
          {mailbox.email_address}
        </p>
      </td>
      <td className="px-3 py-2.5 text-center">
        <div className="inline-block">
          <PillIcon value={mailbox.spf_valid} />
        </div>
      </td>
      <td className="px-3 py-2.5 text-center">
        <div className="inline-block">
          <PillIcon value={mailbox.dkim_valid} />
        </div>
      </td>
      <td className="px-3 py-2.5 text-center">
        <div className="inline-block">
          <PillIcon value={mailbox.dmarc_valid} />
        </div>
      </td>
    </tr>
  );
}

export function DnsHealthPanel({ onRecheckComplete }: DnsHealthPanelProps) {
  const mailboxes = useMailboxes();
  const dnsCheck = useDnsCheck();
  const [checking, setChecking] = useState(false);

  const items = mailboxes.data?.items ?? [];

  async function handleRecheckAll() {
    if (items.length === 0 || checking) return;
    setChecking(true);
    try {
      // Stagger 300ms between requests to avoid hammering the backend/DNS.
      let ok = 0;
      for (let i = 0; i < items.length; i++) {
        const m = items[i];
        if (!m) continue;
        try {
          await dnsCheck.mutateAsync(m.id);
          ok++;
        } catch {
          // Per-mailbox failure is tolerable — keep going.
        }
        if (i < items.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      toast.success(`Rechecked ${ok}/${items.length} mailboxes`);
      onRecheckComplete?.();
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Domain records (DNS) health</CardTitle>
          <CardDescription>
            SPF, DKIM and DMARC validity across every mailbox in this workspace.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={items.length === 0 || checking}
          onClick={handleRecheckAll}
          leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />}
        >
          {checking ? 'Rechecking…' : 'Recheck all'}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {mailboxes.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No mailboxes yet"
            description="Connect a mailbox to see SPF/DKIM/DMARC status."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-muted bg-surface-2/40 text-[11px] uppercase tracking-wider text-text-dim">
                  <th className="px-3 py-2 text-left font-medium">Mailbox</th>
                  <th className="px-3 py-2 text-center font-medium">SPF</th>
                  <th className="px-3 py-2 text-center font-medium">DKIM</th>
                  <th className="px-3 py-2 text-center font-medium">DMARC</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <Row key={m.id} mailbox={m} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
