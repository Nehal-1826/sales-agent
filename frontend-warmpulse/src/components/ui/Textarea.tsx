import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[96px] w-full rounded-lg border bg-surface px-3 py-2 text-sm',
        'text-text placeholder:text-text-dim',
        'focus-ring focus:border-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'border-border-muted',
        invalid && 'border-accent3 focus:border-accent3',
        className,
      )}
      {...props}
    />
  );
});
