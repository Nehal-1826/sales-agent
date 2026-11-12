import { verifyRazorpay } from './billing';
import type { CheckoutResult } from './billing';

const RZP_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayCtor {
  new (options: Record<string, unknown>): { open: () => void; on?: (ev: string, cb: () => void) => void };
}

function loadRazorpay(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = RZP_SRC;
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Payment window did not load.')));
    s.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection."));
    document.head.appendChild(s);
  });
}

/**
 * Continue a checkout payload: Razorpay opens its popup (the handler posts the
 * signature to /billing/razorpay/verify/), Stripe redirects. Resolves with a
 * message when the user finished/aborted; activation itself is server-side.
 */
export async function runCheckout(c: CheckoutResult, onPaid: () => void): Promise<string | null> {
  const url = c.redirect_url ?? c.url;
  if (url) {
    window.location.assign(url);
    return null;
  }
  const options = c.razorpay_options ?? c.options;
  if (!options) return 'The payment provider returned nothing to open.';
  try {
    const Razorpay = await loadRazorpay();
    const rzp = new Razorpay({
      ...options,
      handler: async (r: {
        razorpay_payment_id: string;
        razorpay_subscription_id: string;
        razorpay_signature: string;
      }) => {
        const res = await verifyRazorpay(r);
        if (res.ok) onPaid();
      },
    });
    rzp.open();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Payment could not start.';
  }
}
