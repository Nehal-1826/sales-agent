/**
 * Sentry init seam — gated on ``VITE_SENTRY_DSN``.
 *
 * Without a DSN this module is a no-op: we never call ``init`` and
 * ``SentryErrorBoundary`` falls back to its children. The dynamic
 * import keeps the SDK out of the cold-start path when no DSN is set;
 * Vite still ships the chunk so the prod build can switch it on with
 * an env var change rather than a rebuild.
 */
import { lazy, Suspense, type ReactNode } from 'react';
import { env, isDev } from './env';

let _initialized = false;

/**
 * Initialize Sentry if a DSN is configured. Idempotent — repeat calls are
 * cheap. Returns ``true`` when the init kicked off (the actual SDK load is
 * async; failures are logged silently to keep boot fast).
 */
export function initSentry(): boolean {
  if (_initialized) return true;
  const dsn = env.VITE_SENTRY_DSN;
  if (!dsn) return false;
  _initialized = true;

  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment:
          env.VITE_SENTRY_ENVIRONMENT || (isDev ? 'development' : 'production'),
        // 0% traces by default — perf overhead without a clear signal.
        tracesSampleRate: 0,
        // Replays off by default; the dashboard can opt in per-project.
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
      });
    })
    .catch((err) => {
      // Never let observability machinery crash the app shell.
      // eslint-disable-next-line no-console
      console.warn('Sentry SDK failed to load', err);
    });

  return true;
}

/**
 * Error-boundary wrapper that lazily mounts the Sentry SDK's
 * ErrorBoundary when a DSN is configured, and renders ``children``
 * directly otherwise. The Suspense fallback is a no-op (the children)
 * so first paint isn't blocked on the SDK chunk.
 */
const LazySentryBoundary = lazy(async () => {
  const Sentry = await import('@sentry/react');
  const Boundary = ({ children }: { children: ReactNode }) => (
    <Sentry.ErrorBoundary
      fallback={
        <div className="flex min-h-screen items-center justify-center p-8 text-center">
          <div>
            <h1 className="text-xl font-semibold">Something went wrong.</h1>
            <p className="mt-2 text-sm text-text-dim">
              A bug report was sent to our team. Try refreshing the page.
            </p>
          </div>
        </div>
      }
    >
      {children as React.ReactElement}
    </Sentry.ErrorBoundary>
  );
  return { default: Boundary };
});

export function SentryErrorBoundary({ children }: { children: ReactNode }) {
  if (!env.VITE_SENTRY_DSN) {
    return <>{children}</>;
  }
  return (
    <Suspense fallback={<>{children}</>}>
      <LazySentryBoundary>{children}</LazySentryBoundary>
    </Suspense>
  );
}
