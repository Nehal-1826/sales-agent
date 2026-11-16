/**
 * /maintenance — public full-bleed screen shown while the platform's
 * maintenance mode is ON. The axios response interceptor (lib/api.ts)
 * bounces every non-admin API call that answers 503 {"detail":"maintenance"}
 * here, stashing the backend's human message in sessionStorage on the way.
 *
 * Auto-recovery: pings the maintenance-exempt GET /plans endpoint every 30s;
 * once it answers 200 the "Back online — reload" button appears.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

const MESSAGE_STORAGE_KEY = 'warmpulse.maintenanceMessage';
const RETRY_MS = 30_000;

/** WarmPulse brand mark — same envelope + sparkle logo as the auth pages. */
function BrandMark() {
  return (
    <svg viewBox="0 0 80 80" fill="none" className="h-10 w-10" aria-hidden>
      <rect x="2" y="2" width="76" height="76" rx="20" fill="url(#maintenance-logo-grad)" />
      <path
        d="M16 30 L40 48 L64 30"
        stroke="white"
        strokeWidth="3.5"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M16 30 L16 56 Q16 58 18 58 L62 58 Q64 58 64 56 L64 30"
        stroke="white"
        strokeWidth="3.5"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <g transform="translate(54 22)">
        <path d="M0 -8 L1.8 -1.8 L8 0 L1.8 1.8 L0 8 L-1.8 1.8 L-8 0 L-1.8 -1.8 Z" fill="white" />
      </g>
      <defs>
        <linearGradient id="maintenance-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F26522" />
          <stop offset="1" stopColor="#FF8A4B" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function MaintenancePage() {
  const [online, setOnline] = useState(false);
  // Read once at mount — the interceptor stashed the backend's message in
  // sessionStorage right before redirecting here.
  const [message] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(MESSAGE_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Recovery poll — the interceptor skips the 503 redirect while we're on
  // /maintenance, so a still-down ping just lands in the catch and the next
  // tick retries. Stops as soon as the platform answers 200.
  useEffect(() => {
    if (online) return;
    let cancelled = false;
    const ping = async () => {
      try {
        await api.get('/plans');
        if (!cancelled) setOnline(true);
      } catch {
        /* still down — retry on the next tick */
      }
    };
    void ping();
    const timer = window.setInterval(() => {
      if (!cancelled) void ping();
    }, RETRY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [online]);

  const reload = () => {
    try {
      sessionStorage.removeItem(MESSAGE_STORAGE_KEY);
    } catch {
      /* noop */
    }
    window.location.href = '/';
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg p-6 text-center">
      <div className="flex items-center gap-3">
        <BrandMark />
        <span className="text-xl font-semibold tracking-tight text-text">WarmPulse</span>
      </div>

      <div className="max-w-md space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
          We&rsquo;ll be right back
        </h1>
        <p className="text-sm leading-relaxed text-text-dim">
          {message ??
            'We are performing scheduled maintenance to make WarmPulse better. Your data is safe — please check back shortly.'}
        </p>
        <p className="pt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-text-faint">
          WarmPulse is under scheduled maintenance
        </p>
      </div>

      <div className="flex h-10 items-center">
        {online ? (
          <Button size="lg" onClick={reload}>
            Back online — reload
          </Button>
        ) : (
          <span className="inline-flex items-center gap-2 text-xs text-text-dim">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking every 30s…
          </span>
        )}
      </div>
    </div>
  );
}

export default MaintenancePage;
