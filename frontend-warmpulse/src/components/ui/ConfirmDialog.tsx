/**
 * Singleton confirm() — replaces ``window.confirm``.
 *
 * Usage:
 *   const ok = await confirm({ title: '…', description: '…', danger: true });
 *   if (!ok) return;
 *
 * Mount ``<ConfirmDialogRoot />`` once near the app root (next to
 * ``<AppToaster />``); ``confirm()`` then resolves a Promise that the
 * caller can ``await`` exactly like the OS-level dialog. Unlike
 * ``window.confirm`` this is a tree-mounted Radix Dialog: it's themed,
 * keyboard-accessible, focus-trapped, and renders identically across
 * platforms (the OS dialog is unstyled and ugly on mobile Safari).
 *
 * Implementation: a tiny external store keeps the open/payload state.
 * The component subscribes via ``useSyncExternalStore``; ``confirm()``
 * triggers a state-set and stashes the Promise resolver, which fires
 * when the user confirms or cancels.
 */
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as ``danger`` for destructive actions. */
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions;
  resolve: ((ok: boolean) => void) | null;
}

const _DEFAULT_STATE: ConfirmState = {
  open: false,
  options: { title: '' },
  resolve: null,
};

let _state: ConfirmState = _DEFAULT_STATE;
const _listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function emit(): void {
  for (const fn of _listeners) fn();
}

function setState(next: ConfirmState): void {
  _state = next;
  emit();
}

/**
 * Open the confirm dialog. Returns ``true`` on confirm, ``false`` on
 * cancel / Escape / backdrop-click. Always resolves — never rejects.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    setState({ open: true, options, resolve });
  });
}

function _close(ok: boolean): void {
  const resolve = _state.resolve;
  setState({ ..._DEFAULT_STATE });
  // Resolve after the state-set so a caller awaiting the promise sees
  // the dialog already closed before they continue.
  if (resolve) resolve(ok);
}

export function ConfirmDialogRoot() {
  const state = useSyncExternalStore(
    subscribe,
    () => _state,
    () => _DEFAULT_STATE,
  );
  const { options } = state;

  return (
    <AppDialog
      open={state.open}
      onOpenChange={(next) => {
        if (!next) _close(false);
      }}
    >
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>{options.title}</AppDialogTitle>
          {options.description ? (
            <AppDialogDescription>{options.description}</AppDialogDescription>
          ) : null}
        </AppDialogHeader>
        {/* Keep the body even without a description — Radix needs a stable
            DOM tree so animation transitions stay smooth. */}
        <AppDialogBody><></></AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={() => _close(false)}>
            {options.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={options.danger ? 'danger' : 'primary'}
            onClick={() => _close(true)}
          >
            {options.confirmLabel ?? (options.danger ? 'Delete' : 'Confirm')}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
