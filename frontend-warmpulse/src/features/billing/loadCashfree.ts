/**
 * Lazily injects the Cashfree JS SDK.
 */

const CASHFREE_SRC = 'https://sdk.cashfree.com/js/v3/cashfree.js';

export interface CashfreeCheckoutOptions {
  paymentSessionId: string;
  redirectTarget?: "_modal" | "_self" | "_blank";
}

export interface CashfreeInstance {
  checkout: (options: CashfreeCheckoutOptions) => Promise<{
    error?: { message: string };
    paymentDetails?: any;
    redirect?: boolean;
  }>;
}

declare global {
  interface Window {
    Cashfree?: (config: { mode: "sandbox" | "production" }) => CashfreeInstance;
  }
}

let loadPromise: Promise<boolean> | null = null;

export function loadCashfree(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  if (typeof window !== 'undefined' && window.Cashfree) return Promise.resolve(true);

  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CASHFREE_SRC}"]`,
    );

    const onLoad = () => resolve(Boolean(window.Cashfree));
    const onError = () => {
      loadPromise = null;
      resolve(false);
    };

    if (existing) {
      if (window.Cashfree) {
        resolve(true);
        return;
      }
      existing.addEventListener('load', onLoad, { once: true });
      existing.addEventListener('error', onError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = CASHFREE_SRC;
    script.async = true;
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    document.head.appendChild(script);
  });

  return loadPromise;
}
