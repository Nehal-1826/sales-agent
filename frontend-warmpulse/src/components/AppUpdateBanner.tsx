import { useEffect, useRef, useState } from 'react';
import { Smartphone, X, ArrowDownToLine } from 'lucide-react';

/**
 * App-download promo on the website. Reads the same /downloads/version.json
 * manifest the mobile app uses (one release bump drives both surfaces).
 *
 * Motion per request: it "comes as a popup and goes down" — a prominent
 * bottom-centre card that slides UP into view on load, then auto-slides DOWN
 * out of view after a few seconds (or on Download / dismiss). Shown once per
 * release per browser (dismissed versionCode remembered in localStorage).
 */
const DISMISS_KEY = 'wp.dismissedAppVersion';
const AUTO_HIDE_MS = 9000;
const EXIT_MS = 480;

type AndroidRelease = { versionCode: number; versionName: string; apkUrl: string; notes?: string };

function dismissedCode(): number {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

export function AppUpdateBanner() {
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [shown, setShown] = useState(false); // false → off-screen (down)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch the manifest once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/downloads/version.json', { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { android?: Partial<AndroidRelease> };
        const a = data?.android;
        if (!a || typeof a.versionCode !== 'number' || typeof a.apkUrl !== 'string') return;
        if (a.versionCode <= dismissedCode()) return;
        if (!cancelled) {
          setRelease({
            versionCode: a.versionCode,
            versionName: typeof a.versionName === 'string' ? a.versionName : String(a.versionCode),
            apkUrl: a.apkUrl,
            notes: typeof a.notes === 'string' ? a.notes : undefined,
          });
        }
      } catch {
        /* offline / missing manifest — never block the site */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Slide UP into view, then auto-hide (slide down) after a delay.
  useEffect(() => {
    if (!release) return;
    const enter = requestAnimationFrame(() => setShown(true));
    hideTimer.current = setTimeout(() => hide(), AUTO_HIDE_MS);
    return () => {
      cancelAnimationFrame(enter);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [release]);

  if (!release) return null;

  const persist = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(release.versionCode));
    } catch {
      /* ignore */
    }
  };

  // Slide DOWN out of view, then unmount.
  const hide = () => {
    persist();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShown(false);
    exitTimer.current = setTimeout(() => setRelease(null), EXIT_MS);
  };

  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-md"
      style={{
        transform: shown ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(160%)',
        opacity: shown ? 1 : 0,
        transition: `transform ${EXIT_MS}ms cubic-bezier(0.22,1,0.36,1), opacity ${EXIT_MS}ms ease`,
      }}
    >
      <div
        className="flex items-center gap-3 rounded-2xl border p-4"
        style={{
          background: 'var(--wp-surface, #0a0a0a)',
          borderColor: 'color-mix(in srgb, var(--wp-accent, #F26522) 40%, var(--wp-border, #1f1f1f))',
          boxShadow: '0 18px 60px color-mix(in srgb, var(--wp-accent, #F26522) 26%, transparent)',
        }}
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'color-mix(in srgb, var(--wp-accent, #F26522) 18%, transparent)' }}
        >
          <Smartphone size={20} style={{ color: 'var(--wp-accent, #F26522)' }} strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold" style={{ color: 'var(--wp-text, #f4f4f5)' }}>
            Get the WarmPulse app
          </p>
          <p className="truncate text-[12.5px]" style={{ color: 'var(--wp-text-dim, #a1a1aa)' }}>
            v{release.versionName}
            {release.notes ? ` · ${release.notes}` : ' · Android'}
          </p>
        </div>
        <a
          href={release.apkUrl}
          download
          onClick={hide}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold"
          style={{
            background: 'linear-gradient(180deg, var(--wp-accent, #F26522), var(--wp-accent-hover, #FF7B38))',
            color: '#fff',
          }}
        >
          <ArrowDownToLine size={15} strokeWidth={2.2} />
          Download
        </a>
        <button
          type="button"
          onClick={hide}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1.5"
          style={{ color: 'var(--wp-text-faint, #71717a)' }}
        >
          <X size={18} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
