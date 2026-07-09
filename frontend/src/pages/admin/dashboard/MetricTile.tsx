import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

interface MetricTileProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  hint?: string;
  loading?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

const TONE: Record<NonNullable<MetricTileProps['tone']>, string> = {
  default: 'text-accent',
  success: 'text-accent',
  warning: 'text-accent4',
  danger: 'text-accent3',
};

export function MetricTile({ label, value, icon, hint, loading, tone = 'default' }: MetricTileProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-text-dim">{label}</p>
        {icon ? <span className={cn('h-8 w-8 rounded-md bg-surface-2 flex items-center justify-center', TONE[tone])}>{icon}</span> : null}
      </div>
      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-2xl font-semibold text-text">{value}</p>
        )}
        {hint ? <p className="mt-1 text-xs text-text-dim">{hint}</p> : null}
      </div>
    </Card>
  );
}
