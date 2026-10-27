/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** '1' lets a production build fall back to bundled demo data when offline. */
  readonly VITE_ALLOW_DEMO?: string;
}
