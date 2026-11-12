import { useMemo, useState } from 'react';
import { MoreHorizontal, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  AppDropdown,
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownSeparator,
  AppDropdownTrigger,
} from '@/components/ui/AppDropdown';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { confirm } from '@/components/ui/ConfirmDialog';
import { extractErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { toast } from '@/components/ui/AppToast';
import type { DnsIndicators, MailboxListItem, MailboxLegacyStatus as MailboxStatus } from './api';
import {
  useDeleteMailbox,
  usePauseMailbox,
  useRecheckDns,
  useResumeMailbox,
} from './api';

interface MailboxListTableProps {
  items: MailboxListItem[];
  isLoading?: boolean;
  isError?: boolean;
  onRowClick: (id: string) => void;
  onAddClick: () => void;
}

type SortField = 'email' | 'provider' | 'status' | 'current_day' | 'daily_target' | 'warmth';
type SortDir = 'asc' | 'desc';

function statusVariant(s: MailboxStatus): BadgeVariant {
  if (s === 'active') return 'green';
  if (s === 'paused') return 'neutral';
  if (s === 'error') return 'orange';
  return 'yellow';
}

function statusLabel(s: MailboxStatus): string {
  if (s === 'pending_verification') return 'Verifying';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function providerVariant(p: MailboxListItem['provider']): BadgeVariant {
  switch (p) {
    case 'gmail':
      return 'orange';
    case 'outlook':
      return 'blue';
    case 'yahoo':
      return 'yellow';
    default:
      return 'neutral';
  }
}

function DnsDot({ status, label }: { status: DnsIndicators[keyof DnsIndicators]; label: string }) {
  const color =
    status === 'valid'
      ? 'bg-accent'
      : status === 'missing' || status === 'invalid'
      ? 'bg-accent3'
      : 'bg-text-dim/40';
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-text-dim"
      title={`${label}: ${status}`}
      aria-label={`${label} record is ${status}`}
    >
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  );
}

function WarmthBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color =
    pct < 40 ? 'bg-accent3' : pct < 70 ? 'bg-accent4' : 'bg-accent';
  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-text-dim">{Math.round(pct)}</span>
    </div>
  );
}

function SortIcon({
  field,
  active,
  dir,
}: {
  field: SortField;
  active: SortField;
  dir: SortDir;
}) {
  if (active !== field) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
  return dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

export function MailboxListTable({
  items,
  isLoading,
  isError,
  onRowClick,
  onAddClick,
}: MailboxListTableProps) {
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: 'email',
    dir: 'asc',
  });

  const pause = usePauseMailbox();
  const resume = useResumeMailbox();
  const recheck = useRecheckDns();
  const remove = useDeleteMailbox();

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      switch (sort.field) {
        case 'email':
          return a.email_address.localeCompare(b.email_address) * dir;
        case 'provider':
          return a.provider.localeCompare(b.provider) * dir;
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        case 'current_day':
          return (a.current_day - b.current_day) * dir;
        case 'daily_target':
          return (a.daily_target - b.daily_target) * dir;
        case 'warmth':
          return (a.warmth_score - b.warmth_score) * dir;
        default:
          return 0;
      }
    });
    return copy;
  }, [items, sort]);

  const toggleSort = (field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="Couldn't load mailboxes"
        description="Try refreshing. If the issue persists, check your connection."
      />
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No mailboxes yet"
        description="Add your first mailbox to start warming up your domain."
        action={
          <Button onClick={onAddClick} variant="primary">
            Add mailbox
          </Button>
        }
      />
    );
  }

  const col = (field: SortField, label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-text-dim hover:text-text focus-ring rounded px-1"
    >
      {label}
      <SortIcon field={field} active={sort.field} dir={sort.dir} />
    </button>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border-muted bg-surface">
      <table className="w-full min-w-[720px]" role="table">
        <thead className="bg-surface-2/50">
          <tr className="text-left">
            <th scope="col" className="px-4 py-3">{col('email', 'Email')}</th>
            <th scope="col" className="px-4 py-3">{col('provider', 'Provider')}</th>
            <th scope="col" className="px-4 py-3">{col('status', 'Status')}</th>
            <th scope="col" className="px-4 py-3">{col('current_day', 'Day')}</th>
            <th scope="col" className="px-4 py-3">{col('daily_target', 'Target')}</th>
            <th scope="col" className="px-4 py-3">{col('warmth', 'Warmth')}</th>
            <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">Domain (DNS)</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {sorted.map((m) => (
            <tr
              key={m.id}
              className="cursor-pointer transition-colors hover:bg-surface-2/50"
              onClick={() => onRowClick(m.id)}
            >
              <td className="px-4 py-3 text-sm font-medium">{m.email_address}</td>
              <td className="px-4 py-3">
                <Badge variant={providerVariant(m.provider)}>{m.provider}</Badge>
              </td>
              <td className="px-4 py-3">
                <Badge variant={statusVariant(m.status)}>
                  {m.is_paused ? 'Paused' : statusLabel(m.status)}
                </Badge>
              </td>
              <td className="px-4 py-3 text-sm tabular-nums">D{m.current_day}</td>
              <td className="px-4 py-3 text-sm tabular-nums text-text-dim">{m.daily_target}/day</td>
              <td className="px-4 py-3">
                <WarmthBar value={m.warmth_score} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <DnsDot status={m.dns.spf} label="SPF" />
                  <DnsDot status={m.dns.dkim} label="DKIM" />
                  <DnsDot status={m.dns.dmarc} label="DMARC" />
                </div>
              </td>
              <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                <AppDropdown>
                  <AppDropdownTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Row actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </AppDropdownTrigger>
                  <AppDropdownContent align="end">
                    {m.is_paused ? (
                      <AppDropdownItem
                        onClick={() =>
                          resume.mutate(m.id, {
                            onSuccess: () => toast.success('Mailbox resumed'),
                            onError: () => toast.error('Failed to resume'),
                          })
                        }
                      >
                        <Play className="h-3.5 w-3.5" /> Resume
                      </AppDropdownItem>
                    ) : (
                      <AppDropdownItem
                        onClick={() =>
                          pause.mutate(m.id, {
                            onSuccess: () => toast.success('Mailbox paused'),
                            onError: () => toast.error('Failed to pause'),
                          })
                        }
                      >
                        <Pause className="h-3.5 w-3.5" /> Pause
                      </AppDropdownItem>
                    )}
                    <AppDropdownItem
                      onClick={() =>
                        recheck.mutate(m.id, {
                          onSuccess: () => toast.success('DNS re-checked'),
                          onError: () => toast.error('DNS check failed'),
                        })
                      }
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Recheck DNS
                    </AppDropdownItem>
                    <AppDropdownSeparator />
                    <AppDropdownItem
                      danger
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Delete mailbox?',
                          description: `${m.email_address} and its entire warmup history will be removed. This cannot be undone.`,
                          confirmLabel: 'Delete',
                          danger: true,
                        });
                        if (!ok) return;
                        remove.mutate(m.id, {
                          onSuccess: () => toast.success('Mailbox deleted'),
                          onError: (err) =>
                            toast.error(extractErrorMessage(err, 'Failed to delete')),
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </AppDropdownItem>
                  </AppDropdownContent>
                </AppDropdown>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
