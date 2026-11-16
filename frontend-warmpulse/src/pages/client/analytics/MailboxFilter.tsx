import { Inbox } from 'lucide-react';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { useMailboxes } from '@/features/mailboxes/api';

interface MailboxFilterProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function MailboxFilter({ value, onChange, className }: MailboxFilterProps) {
  const mailboxes = useMailboxes();
  const items = mailboxes.data?.items ?? [];

  return (
    <AppSelect value={value} onValueChange={onChange}>
      <AppSelectTrigger className={className ?? 'h-9 w-[240px] text-sm'}>
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
  );
}
