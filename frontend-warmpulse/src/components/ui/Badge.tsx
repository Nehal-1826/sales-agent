import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeVariant = 'green' | 'blue' | 'orange' | 'yellow' | 'neutral';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANTS: Record<BadgeVariant, string> = {
  green: 'bg-accent/10 text-accent border-accent/30',
  blue: 'bg-accent2/10 text-accent2 border-accent2/30',
  orange: 'bg-accent3/10 text-accent3 border-accent3/30',
  yellow: 'bg-accent4/10 text-accent4 border-accent4/30',
  neutral: 'bg-surface-2 text-text-dim border-border-muted',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = 'neutral', ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
});
