import { useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { cn } from '@/lib/cn';

interface RefreshButtonProps {
  /**
   * Restrict invalidation + the spinner state to queries whose key starts
   * with this prefix. Omit to invalidate every active query in the
   * QueryClient — useful for a "refresh whatever's on screen" button.
   */
  queryKey?: QueryKey;
  /** Tooltip / aria-label. Defaults to "Refresh". */
  label?: string;
  /**
   * Hide the visible label (icon-only). The aria-label still reads
   * `label`, so this stays accessible. Defaults to false.
   */
  iconOnly?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
}

/**
 * Generic "refresh this view" button.
 *
 * Reads `useQueryClient()`, invalidates the requested keys (or all queries
 * when `queryKey` is omitted), and shows a spinner while any matching query
 * is refetching.
 *
 * Drop in anywhere — page headers, card chrome, the global TopBar — without
 * coupling to a specific feature.
 */
export function RefreshButton({
  queryKey,
  label = 'Refresh',
  iconOnly = false,
  size = 'sm',
  variant = 'ghost',
  className,
}: RefreshButtonProps) {
  const qc = useQueryClient();
  const isFetching =
    (queryKey ? qc.isFetching({ queryKey }) : qc.isFetching()) > 0;

  const onClick = () => {
    if (queryKey) {
      void qc.invalidateQueries({ queryKey });
    } else {
      void qc.invalidateQueries();
    }
  };

  const icon = isFetching ? (
    <Loader2 className={cn('h-3.5 w-3.5 animate-spin')} />
  ) : (
    <RefreshCw className="h-3.5 w-3.5" />
  );

  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={isFetching}
      className={className}
      aria-label={label}
      title={label}
      leftIcon={icon}
    >
      {iconOnly || size === 'icon' ? null : label}
    </Button>
  );
}
