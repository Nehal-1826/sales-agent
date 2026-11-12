import { Toaster as SonnerToaster, toast } from 'sonner';

/**
 * Sonner-based toast system. Theme-aligned with the dark palette.
 * Import `toast` anywhere in the app for `toast.success`, `toast.error`, etc.
 */
export function AppToaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'bg-surface border border-border-muted text-text rounded-lg shadow-xl',
          title: 'text-text font-medium',
          description: 'text-text-dim',
          actionButton: 'bg-accent text-bg',
          cancelButton: 'bg-surface-2 text-text',
        },
      }}
    />
  );
}

export { toast };
