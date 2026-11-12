import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-14 px-6',
        'rounded-xl border border-dashed border-border-muted bg-surface/60',
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-accent">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description ? (
        <p className="mt-1 text-sm text-text-dim max-w-md">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
