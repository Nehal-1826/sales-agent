import { InlineLoader } from '@/components/loaders';
import { cn } from '@/lib/cn';

interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Inline loader — re-exports the WarmPulse Diamond Mesh loader (I3).
 * `label` is forwarded as the aria-label on the role="status" wrapper.
 */
export function Spinner({ size = 32, className, label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex', className)}>
      <InlineLoader size={size} />
    </span>
  );
}
