import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2,
  Mail,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plug,
  Trash2,
} from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  AppDropdown,
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownSeparator,
  AppDropdownTrigger,
} from '@/components/ui/AppDropdown';
import { toast } from '@/components/ui/AppToast';
import { cn } from '@/lib/cn';
import type { Mailbox, MailboxProvider } from '@/features/mailboxes/types';
import { warmthColorToken } from '@/features/mailboxes/types';
import {
  usePauseMailbox,
  useResumeMailbox,
  useTestConnection,
} from '@/features/mailboxes/api';

interface MailboxCardProps {
  mailbox: Mailbox;
  onEdit?: (id: string) => void;
  onDelete?: (mailbox: Mailbox) => void;
}

const PROVIDER_COLOR: Record<MailboxProvider, string> = {
  gmail: 'text-accent3',
  outlook: 'text-accent2',
  yahoo: 'text-accent4',
  smtp: 'text-text-dim',
};

const PROVIDER_LABEL: Record<MailboxProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
};

function statusVariant(m: Mailbox): BadgeVariant {
  if (m.is_paused) return 'yellow';
  if (m.warmup_status === 'active') return 'green';
  if (m.warmup_status === 'pending') return 'blue';
  if (m.warmup_status === 'completed') return 'neutral';
  return 'neutral';
}

function statusLabel(m: Mailbox): string {
  if (m.is_paused) return 'Paused';
  return m.warmup_status.charAt(0).toUpperCase() + m.warmup_status.slice(1);
}

function fallbackSpark(base: number): Array<{ i: number; v: number }> {
  return Array.from({ length: 7 }, (_, i) => ({
    i,
    v: Math.max(0, Math.min(100, Math.round(base + Math.sin(i * 1.3 + base) * 4))),
  }));
}

const WARMTH_HEX: Record<'accent' | 'accent4' | 'accent3', string> = {
  accent: '#F26522',
  accent4: '#ffd54f',
  accent3: '#ff6b4a',
};

export function MailboxCard({ mailbox, onEdit, onDelete }: MailboxCardProps) {
  const pause = usePauseMailbox();
  const resume = useResumeMailbox();
  const testConn = useTestConnection();

  const warmth = Math.round(mailbox.warmth_score);
  const warmthToken = warmthColorToken(warmth);
  const warmthColor = WARMTH_HEX[warmthToken];

  const rampPct = Math.min(100, Math.round((mailbox.current_day / 28) * 100));

  const spark =
    mailbox.warmth_sparkline && mailbox.warmth_sparkline.length > 0
      ? mailbox.warmth_sparkline.map((v, i) => ({ i, v }))
      : fallbackSpark(warmth);

  const handlePauseToggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (mailbox.is_paused) {
      resume.mutate(mailbox.id, {
        onSuccess: () => toast.success('Mailbox resumed'),
        onError: () => toast.error('Failed to resume'),
      });
    } else {
      pause.mutate(mailbox.id, {
        onSuccess: () => toast.success('Mailbox paused'),
        onError: () => toast.error('Failed to pause'),
      });
    }
  };

  const handleTest = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    testConn.mutate(mailbox.id, {
      onSuccess: (r) => {
        if (r.error === 'not_available') {
          toast('Test connection not available yet');
        } else if (r.smtp_ok && r.imap_ok) {
          toast.success('SMTP & IMAP OK');
        } else {
          toast.error(r.error ?? 'Connection failed');
        }
      },
      onError: () => toast.error('Test failed'),
    });
  };

  return (
    <Link
      to={`/app/mailboxes/${mailbox.id}`}
      className="group block focus-ring rounded-xl"
      aria-label={`Open ${mailbox.email_address}`}
    >
      <Card
        className={cn(
          'flex h-full flex-col transition-all',
          'hover:ring-1 hover:ring-accent/20 hover:shadow-[0_0_24px_rgba(242, 101, 34,0.1)]',
          mailbox.is_paused && 'opacity-80',
        )}
      >
        {/* Top row: provider + email + status */}
        <div className="flex items-start justify-between gap-2 p-4 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <Mail className={cn('h-4 w-4 shrink-0', PROVIDER_COLOR[mailbox.provider])} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{mailbox.email_address}</p>
              <p className="text-[11px] uppercase tracking-wider text-text-dim">
                {PROVIDER_LABEL[mailbox.provider]}
              </p>
            </div>
          </div>
          <Badge variant={statusVariant(mailbox)}>{statusLabel(mailbox)}</Badge>
        </div>

        {/* Middle: ramp progress + warmth score */}
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-[11px] text-text-dim">
              <span>Build-up</span>
              <span>
                Day {mailbox.current_day} / 28
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${rampPct}%` }}
              />
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-text-dim">Warmth</p>
            <p
              className="text-2xl font-semibold tabular-nums leading-none"
              style={{ color: warmthColor }}
            >
              {warmth}
            </p>
          </div>
        </div>

        {/* Sparkline */}
        <div className="h-10 w-full px-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={warmthColor}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bottom row: today's count + quick actions */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-muted p-3">
          <div className="text-xs text-text-dim">
            <span className="font-medium text-text">{mailbox.sent_today ?? 0}</span> sent today
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePauseToggle}
              disabled={pause.isPending || resume.isPending}
              aria-label={mailbox.is_paused ? 'Resume' : 'Pause'}
            >
              {pause.isPending || resume.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : mailbox.is_paused ? (
                <Play className="h-3.5 w-3.5" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTest}
              disabled={testConn.isPending}
              aria-label="Test connection"
              title="Test SMTP / IMAP connection"
            >
              {testConn.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="h-3.5 w-3.5" />
              )}
            </Button>
            <AppDropdown>
              <AppDropdownTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="More actions"
                  onClick={(e) => e.preventDefault()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </AppDropdownTrigger>
              <AppDropdownContent align="end">
                {onEdit ? (
                  <AppDropdownItem
                    onSelect={(e) => {
                      e.preventDefault();
                      onEdit(mailbox.id);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </AppDropdownItem>
                ) : null}
                <AppDropdownSeparator />
                <AppDropdownItem
                  danger
                  onSelect={(e) => {
                    e.preventDefault();
                    onDelete?.(mailbox);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </AppDropdownItem>
              </AppDropdownContent>
            </AppDropdown>
          </div>
        </div>
      </Card>
    </Link>
  );
}
