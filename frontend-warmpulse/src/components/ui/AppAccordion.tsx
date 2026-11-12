import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export const AppAccordion = AccordionPrimitive.Root;

export const AppAccordionItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AppAccordionItem({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={cn('border-b border-border-muted', className)}
      {...props}
    />
  );
});

export const AppAccordionTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AppAccordionTrigger({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          'flex flex-1 items-center justify-between py-4 text-left text-sm font-medium text-text',
          'transition-colors hover:text-accent',
          '[&[data-state=open]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform text-text-dim" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
});

export const AppAccordionContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AppAccordionContent({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className={cn(
        'overflow-hidden text-sm text-text-dim',
        'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down',
        className,
      )}
      {...props}
    >
      <div className="pb-4 pt-0">{children}</div>
    </AccordionPrimitive.Content>
  );
});
