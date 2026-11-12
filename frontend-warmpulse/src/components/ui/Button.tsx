import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { ButtonLoader } from '@/components/loaders';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  isLoading?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-bg hover:bg-accent/90 shadow-glow font-semibold',
  secondary:
    'bg-surface-2 text-text hover:bg-surface-2/80 border border-border-muted',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-accent3 text-white hover:bg-accent3/90 font-semibold',
  outline:
    'bg-transparent text-text border border-border-muted hover:bg-surface-2',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-10 w-10 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    asChild = false,
    leftIcon,
    rightIcon,
    isLoading = false,
    disabled,
    children,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  const classes = cn(
    'inline-flex items-center justify-center rounded-lg transition-colors',
    'focus-ring disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
  // Slot requires exactly one child. When asChild is used, skip the icon spans
  // (callers put icons inside the child element themselves) and pass `children` through.
  if (asChild) {
    return (
      <Comp ref={ref} className={classes} {...props}>
        {children as ReactNode}
      </Comp>
    );
  }
  return (
    <Comp ref={ref} className={classes} disabled={isLoading || disabled} {...props}>
      {isLoading ? (
        <span className="shrink-0">
          <ButtonLoader />
        </span>
      ) : leftIcon ? (
        <span className="shrink-0">{leftIcon}</span>
      ) : null}
      {children}
      {rightIcon && !isLoading ? <span className="shrink-0">{rightIcon}</span> : null}
    </Comp>
  );
});
