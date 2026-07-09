import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCurrentUsage } from '@/features/billing/api';
import { formatNumber } from '@/lib/format';

interface BarProps {
  label: string;
  used: number;
  cap: number;
  formatter?: (v: number) => string;
}

function pct(used: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(100, (used / cap) * 100));
}

function colorForPct(p: number): string {
  if (p >= 100) return 'bg-accent3';
  if (p >= 80) return 'bg-accent4';
  return 'bg-accent';
}

function UsageBar({ label, used, cap, formatter }: BarProps) {
  const p = pct(used, cap);
  const bar = colorForPct(p);
  const fmt = formatter ?? ((v: number) => formatNumber(v));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-dim">{label}</span>
        <span className="font-medium tabular-nums text-text">
          {fmt(used)} <span className="text-text-dim">/ {fmt(cap)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full transition-all ${bar}`}
          style={{ width: `${p}%` }}
          aria-valuenow={Math.round(p)}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>
    </div>
  );
}

export function UsageCard() {
  const usage = useCurrentUsage();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage this month</CardTitle>
        <CardDescription>Caps reset on your next billing date.</CardDescription>
      </CardHeader>
      <CardContent>
        {usage.isLoading || !usage.data ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <UsageBar
              label="Mailboxes"
              used={usage.data.mailboxes_used}
              cap={usage.data.mailboxes_cap}
            />
            <UsageBar
              label="Warmup emails"
              used={usage.data.warmup_emails_sent_mtd}
              // 3000 is a reasonable monthly proxy for now — spec lists
              // "Warmup emails this month (123/3000)" as the example.
              cap={Math.max(usage.data.mailboxes_cap * 600, 3000)}
            />
            <UsageBar
              label="AI tokens"
              used={usage.data.llm_tokens_used_mtd}
              cap={usage.data.llm_tokens_cap}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
