import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export const AppDropdown = DropdownMenu.Root;
export const AppDropdownTrigger = DropdownMenu.Trigger;
export const AppDropdownGroup = DropdownMenu.Group;
export const AppDropdownPortal = DropdownMenu.Portal;
export const AppDropdownSub = DropdownMenu.Sub;
export const AppDropdownRadioGroup = DropdownMenu.RadioGroup;

export const AppDropdownContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(function AppDropdownContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[12rem] rounded-lg border border-border-muted bg-surface p-1 shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          'data-[side=bottom]:slide-in-from-top-2',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
});

export const AppDropdownItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { inset?: boolean; danger?: boolean }
>(function AppDropdownItem({ className, inset, danger, ...props }, ref) {
  return (
    <DropdownMenu.Item
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5',
        'text-sm text-text outline-none transition-colors',
        'focus:bg-surface-2 focus:text-text',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        danger && 'text-accent3 focus:text-accent3',
        className,
      )}
      {...props}
    />
  );
});

export const AppDropdownCheckboxItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.CheckboxItem>
>(function AppDropdownCheckboxItem({ className, children, checked, ...props }, ref) {
  return (
    <DropdownMenu.CheckboxItem
      ref={ref}
      checked={checked}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none',
        'focus:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenu.ItemIndicator>
          <Check className="h-3.5 w-3.5" />
        </DropdownMenu.ItemIndicator>
      </span>
      {children}
    </DropdownMenu.CheckboxItem>
  );
});

export const AppDropdownLabel = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.Label>
>(function AppDropdownLabel({ className, ...props }, ref) {
  return (
    <DropdownMenu.Label
      ref={ref}
      className={cn('px-2 py-1.5 text-xs font-medium text-text-dim', className)}
      {...props}
    />
  );
});

export const AppDropdownSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.Separator>
>(function AppDropdownSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenu.Separator
      ref={ref}
      className={cn('my-1 h-px bg-border-muted', className)}
      {...props}
    />
  );
});

export const AppDropdownShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ml-auto text-xs tracking-widest text-text-dim', className)} {...props} />
);

export const AppDropdownSubTrigger = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.SubTrigger>
>(function AppDropdownSubTrigger({ className, children, ...props }, ref) {
  return (
    <DropdownMenu.SubTrigger
      ref={ref}
      className={cn(
        'flex cursor-pointer select-none items-center rounded-md px-2.5 py-1.5 text-sm outline-none',
        'focus:bg-surface-2 data-[state=open]:bg-surface-2',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4" />
    </DropdownMenu.SubTrigger>
  );
});

export const AppDropdownSubContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenu.SubContent>
>(function AppDropdownSubContent({ className, ...props }, ref) {
  return (
    <DropdownMenu.SubContent
      ref={ref}
      className={cn(
        'z-50 min-w-[10rem] rounded-lg border border-border-muted bg-surface p-1 shadow-xl',
        className,
      )}
      {...props}
    />
  );
});
