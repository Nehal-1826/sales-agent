import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/cn';

export const AppPopover = PopoverPrimitive.Root;
export const AppPopoverTrigger = PopoverPrimitive.Trigger;
export const AppPopoverAnchor = PopoverPrimitive.Anchor;

export const AppPopoverContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function AppPopoverContent({ className, sideOffset = 6, align = 'center', ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-lg border border-border-muted bg-surface p-4 text-text shadow-xl outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
