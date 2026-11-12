import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/cn';

export const TooltipProvider = TooltipPrimitive.Provider;
export const AppTooltip = TooltipPrimitive.Root;
export const AppTooltipTrigger = TooltipPrimitive.Trigger;

export const AppTooltipContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function AppTooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-md border border-border-muted bg-surface-2 px-2 py-1 text-xs text-text shadow-lg',
          'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
          'data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
