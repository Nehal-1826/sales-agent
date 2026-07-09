import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

export interface ChartContainerProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
  height?: number | string;
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * Consistent outer wrapper for every chart in the library.
 * Handles: header row (title/subtitle/actions), loading skeleton,
 * error state, empty state, fixed height, and a11y role.
 */
export function ChartContainer({
  title,
  subtitle,
  actions,
  loading = false,
  error = null,
  empty = false,
  emptyLabel = 'No data to display yet.',
  height = 320,
  className,
  bodyClassName,
  ariaLabel,
  children,
}: ChartContainerProps) {
  const heightStyle = typeof height === 'number' ? `${height}px` : height;
  const hasHeader = Boolean(title || subtitle || actions);
  const resolvedAria = ariaLabel ?? ([title, subtitle].filter(Boolean).join(' — ') || undefined);

  return (
    <Card className={cn('overflow-hidden', className)}>
      {hasHeader ? (
        <div className="flex items-start gap-3 border-b border-border-muted p-5">
          <div className="flex min-w-0 flex-col gap-1">
            {title ? (
              <h3 className="text-lg font-semibold text-text">{title}</h3>
            ) : null}
            {subtitle ? <p className="text-xs text-text-dim">{subtitle}</p> : null}
          </div>
          {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}

      <div
        className={cn('relative p-5', bodyClassName)}
        role="img"
        aria-label={resolvedAria}
        style={{ minHeight: heightStyle }}
      >
        {loading ? (
          <Skeleton className="h-full w-full" style={{ height: heightStyle }} />
        ) : error ? (
          <div
            className="flex items-center justify-center text-center text-sm text-accent3"
            style={{ height: heightStyle }}
          >
            {error}
          </div>
        ) : empty ? (
          <div
            className="flex items-center justify-center text-center text-sm text-text-dim"
            style={{ height: heightStyle }}
          >
            {emptyLabel}
          </div>
        ) : (
          <div style={{ height: heightStyle }}>{children}</div>
        )}
      </div>
    </Card>
  );
}
