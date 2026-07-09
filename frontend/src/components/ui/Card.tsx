import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type DivProps = HTMLAttributes<HTMLDivElement>;

/**
 * Liquid-glass card.
 *
 * - Translucent surface (60% surface tint + saturate boost so colours behind
 *   the card don't go grey).
 * - Backdrop blur for the frosted depth.
 * - Subtle inset highlight on the top edge (in the `glass` shadow).
 * - Hover: warmer accent glow + a one-shot diagonal shimmer via the
 *   `glassShimmer` keyframe.
 *
 * `variant="solid"` opts out of the glass treatment when legibility wins
 * (modals already sit on their own scrim).
 */
interface CardProps extends DivProps {
  variant?: 'glass' | 'solid';
  /** Disable the hover shimmer. Useful inside dense lists. */
  noShimmer?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = 'glass', noShimmer, children, ...props },
  ref,
) {
  if (variant === 'solid') {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border border-border-muted bg-surface shadow-sm',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className={cn(
        'group relative isolate overflow-hidden rounded-xl',
        'border border-white/[0.07] bg-surface/60 backdrop-blur-xl backdrop-saturate-150',
        'shadow-glass transition-all duration-300',
        'hover:border-accent/30 hover:shadow-glass-hover hover:bg-surface/70',
        className,
      )}
      {...props}
    >
      {!noShimmer ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 -inset-x-1/3 -z-[1] block',
            'bg-gradient-to-r from-transparent via-white/[0.06] to-transparent',
            'opacity-0 group-hover:opacity-100 motion-reduce:hidden',
            'group-hover:animate-glassShimmer',
          )}
        />
      ) : null}
      {children}
    </div>
  );
});

export const CardHeader = forwardRef<HTMLDivElement, DivProps>(function CardHeader(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1 p-5 border-b border-white/5', className)}
      {...props}
    />
  );
});

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn('text-base font-semibold text-text', className)}
        {...props}
      />
    );
  },
);

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('text-sm text-text-dim', className)} {...props} />;
});

export const CardContent = forwardRef<HTMLDivElement, DivProps>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('p-5', className)} {...props} />;
});

export const CardFooter = forwardRef<HTMLDivElement, DivProps>(function CardFooter(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('flex items-center p-5 pt-0 border-t border-white/5', className)}
      {...props}
    />
  );
});
