import { useEffect, useState, type ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/* Toasts — a tiny global store, no context needed                     */
/* ------------------------------------------------------------------ */

export type ToastTone = 'success' | 'error' | 'info' | 'warn';

interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  listeners.forEach((l) => l(toasts));
}

function push(tone: ToastTone, text: string, ms: number) {
  const id = nextId++;
  toasts = [...toasts.slice(-3), { id, tone, text }];
  emit();
  window.setTimeout(() => dismiss(id), ms);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** toast.success('Sent') · toast.error('…') · toast.info('…') · toast.warn('…') */
export const toast = {
  success: (text: string) => push('success', text, 3500),
  error: (text: string) => push('error', text, 7000),
  info: (text: string) => push('info', text, 4500),
  /** worked, but not fully — e.g. approved yet not delivered */
  warn: (text: string) => push('warn', text, 7000),
};

/** Mounted once in App — announces every toast to screen readers. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>(toasts);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <span className="toast-icon" aria-hidden>
            {t.tone === 'success' ? '✓' : t.tone === 'error' || t.tone === 'warn' ? '!' : 'i'}
          </span>
          <span className="toast-text">{t.text}</span>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline feedback                                                     */
/* ------------------------------------------------------------------ */

export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <div className="banner-body">
        <strong>{title}</strong>
        {children && <span>{children}</span>}
      </div>
      {action && <div className="banner-action">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon" aria-hidden>{icon}</div>}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/** Loading placeholder rows — keeps layout stable instead of a page spinner. */
export function Skeleton({ rows = 3, height = 18 }: { rows?: number; height?: number }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton-row" style={{ height, width: `${92 - i * 11}%` }} />
      ))}
    </div>
  );
}

/** Error panel with a retry button — for getters that failed in live mode. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Banner
      tone="error"
      title="Couldn't load this"
      action={
        <button className="btn btn-sm" onClick={onRetry}>
          Try again
        </button>
      }
    >
      {message}
    </Banner>
  );
}

/** Shown when a refresh failed but older data is still on screen. */
export function StaleNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <Banner
      tone="warn"
      title="Showing the last known data — couldn't refresh."
      action={
        <button className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
      }
    />
  );
}
