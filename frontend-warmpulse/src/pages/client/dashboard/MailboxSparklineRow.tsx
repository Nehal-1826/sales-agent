import { Link } from 'react-router-dom';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { Mailbox, MailboxStatus } from '@/features/mailboxes/types';
import { cn } from '@/lib/cn';

interface MailboxSparklineRowProps {
  mailboxes: Mailbox[];
  isLoading?: boolean;
}

function statusVariant(status: MailboxStatus, paused: boolean): BadgeVariant {
  if (paused) return 'yellow';
  if (status === 'active') return 'green';
  if (status === 'pending') return 'blue';
  if (status === 'completed') return 'neutral';
  return 'neutral';
}

function statusLabel(status: MailboxStatus, paused: boolean): string {
  if (paused) return 'Paused';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function strokeFor(score: number): string {
  if (score < 40) return '#ff6b4a';
  if (score < 70) return '#ffd54f';
  return '#F26522';
}

function fallbackSparkline(base: number): number[] {
  // 7 points around `base` — deterministic so cards don't shimmer on re-render.
  return Array.from({ length: 7 }, (_, i) => {
    const wobble = Math.sin(i * 1.3 + base) * 4;
    return Math.max(0, Math.min(100, Math.round(base + wobble)));
  });
}

export function MailboxSparklineRow({ mailboxes, isLoading }: MailboxSparklineRowProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mailboxes</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 overflow-x-auto pt-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-60 shrink-0 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Mailboxes</CardTitle>
          <p className="text-xs text-text-dim">{mailboxes.length} in this workspace — scroll for more.</p>
        </div>
        <Link
          to="/app/mailboxes"
          className="text-xs font-medium text-accent hover:underline focus-ring rounded"
        >
          View all →
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
          {mailboxes.map((m) => {
            const spark = (m.warmth_sparkline && m.warmth_sparkline.length > 0
              ? m.warmth_sparkline
              : fallbackSparkline(m.warmth_score)
            ).map((v, i) => ({ i, v }));
            const color = strokeFor(m.warmth_score);

            return (
              <Link
                key={m.id}
                to={`/app/mailboxes/${m.id}`}
                className={cn(
                  'group flex w-60 shrink-0 flex-col gap-2 rounded-lg border border-border-muted',
                  'bg-surface-2/40 p-3 transition-all hover:border-accent/30 hover:bg-surface-2/70',
                  'hover:ring-1 hover:ring-accent/20 focus-ring',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-text">
                    {m.email_address}
                  </p>
                  <Badge variant={statusVariant(m.warmup_status, m.is_paused)}>
                    {statusLabel(m.warmup_status, m.is_paused)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-dim">
                  <span className="font-medium text-text">{m.sent_today ?? 0}</span>
                  <span>sent today</span>
                  <span className="ml-auto font-medium" style={{ color }}>
                    {Math.round(m.warmth_score)}
                  </span>
                </div>
                <div className="h-10 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={spark}>
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
