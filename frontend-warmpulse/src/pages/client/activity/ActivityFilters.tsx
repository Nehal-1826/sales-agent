import { Inbox, Search } from 'lucide-react';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { Input } from '@/components/ui/Input';
import { useMailboxes } from '@/features/mailboxes/api';
import type { ActivityAction, ActivityFilterState } from '@/features/activity/types';

interface ActivityFiltersProps {
  value: ActivityFilterState;
  onChange: (v: ActivityFilterState) => void;
}

const ACTION_OPTIONS: Array<{ value: ActivityAction | 'all'; label: string }> = [
  { value: 'all', label: 'All actions' },
  { value: 'sent', label: 'Sent' },
  { value: 'opened', label: 'Opened' },
  { value: 'replied', label: 'Replied' },
  { value: 'starred', label: 'Starred' },
  { value: 'spam_rescued', label: 'Spam recovery' },
  { value: 'marked_important', label: 'Marked important' },
];

export function ActivityFilters({ value, onChange }: ActivityFiltersProps) {
  const mailboxes = useMailboxes();
  const items = mailboxes.data?.items ?? [];

  const mailboxValue = value.mailbox_id ?? 'all';
  const actionValue = value.action ?? 'all';
  const searchValue = value.search ?? '';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <AppSelect
        value={mailboxValue}
        onValueChange={(v) => onChange({ ...value, mailbox_id: v === 'all' ? undefined : v })}
      >
        <AppSelectTrigger className="h-9 w-[240px] text-sm">
          <span className="inline-flex items-center gap-2 truncate">
            <Inbox className="h-3.5 w-3.5 text-text-dim" />
            <AppSelectValue placeholder="All mailboxes" />
          </span>
        </AppSelectTrigger>
        <AppSelectContent>
          <AppSelectItem value="all">All mailboxes</AppSelectItem>
          {items.map((m) => (
            <AppSelectItem key={m.id} value={m.id}>
              {m.email_address}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </AppSelect>

      <AppSelect
        value={actionValue}
        onValueChange={(v) =>
          onChange({
            ...value,
            action: v === 'all' ? undefined : (v as ActivityAction),
          })
        }
      >
        <AppSelectTrigger className="h-9 w-[180px] text-sm">
          <AppSelectValue placeholder="All actions" />
        </AppSelectTrigger>
        <AppSelectContent>
          {ACTION_OPTIONS.map((opt) => (
            <AppSelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </AppSelect>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
        <Input
          type="search"
          placeholder="Search subject or email…"
          value={searchValue}
          onChange={(e) =>
            onChange({ ...value, search: e.target.value || undefined })
          }
          className="h-9 w-[260px] pl-9 text-sm"
          aria-label="Search activity"
        />
      </div>
    </div>
  );
}
