/**
 * Type-safe env accessor. Centralises all `import.meta.env` reads so that
 * missing or malformed values surface at boot rather than at use-site.
 */

type RequiredEnv = {
  VITE_API_BASE_URL: string;
  VITE_APP_NAME: string;
};

type OptionalEnv = {
  VITE_SENTRY_DSN: string;
  VITE_SENTRY_ENVIRONMENT: string;
};

function readEnv<K extends keyof RequiredEnv>(key: K, fallback: RequiredEnv[K]): RequiredEnv[K] {
  const value = import.meta.env[key];
  if (typeof value === 'string' && value.length > 0) return value as RequiredEnv[K];
  return fallback;
}

function readOptional<K extends keyof OptionalEnv>(key: K): string {
  const value = (import.meta.env as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export const env: RequiredEnv & OptionalEnv = {
  VITE_API_BASE_URL: readEnv('VITE_API_BASE_URL', '/api'),
  VITE_APP_NAME: readEnv('VITE_APP_NAME', 'WarmPulse'),
  VITE_SENTRY_DSN: readOptional('VITE_SENTRY_DSN'),
  VITE_SENTRY_ENVIRONMENT: readOptional('VITE_SENTRY_ENVIRONMENT'),
};

export const isDev = import.meta.env.DEV;
export const isProd = import.meta.env.PROD;
