import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { CURRENCY_LIST, useCurrencyStore, type CurrencyCode } from '@/lib/currency';

interface CurrencySwitcherProps {
  className?: string;
}

/**
 * Compact flag-dropdown for switching display currency.
 * Persists choice to localStorage via the currency store.
 */
export function CurrencySwitcher({ className = '' }: CurrencySwitcherProps) {
  const code = useCurrencyStore((s) => s.code);
  const setCode = useCurrencyStore((s) => s.setCode);
  const active = CURRENCY_LIST.find((c) => c.code === code) ?? CURRENCY_LIST[0];
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (next: CurrencyCode) => {
    setCode(next);
    setOpen(false);
  };

  // CURRENCY_LIST is a non-empty constant, so `active` is always defined at
  // runtime; this guard only narrows the type for noUncheckedIndexedAccess.
  if (!active) return null;

  return (
    <div ref={containerRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Currency: ${active.name}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium"
        style={{
          background: 'color-mix(in srgb, var(--wp-surface) 60%, transparent)',
          border: '1px solid var(--wp-glass-border)',
          backdropFilter: 'blur(12px)',
          color: 'var(--wp-text)',
        }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }} aria-hidden>
          {active.flag}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600 }}>
          {active.code}
        </span>
        <ChevronDown size={12} strokeWidth={2.2} style={{ opacity: 0.6 }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            className="absolute right-0 top-full z-50 mt-2 w-[220px] overflow-hidden rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--wp-surface) 85%, transparent)',
              border: '1px solid var(--wp-glass-border)',
              backdropFilter: 'blur(20px) saturate(160%)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.4), 0 0 0 1px color-mix(in srgb, var(--wp-accent) 12%, transparent)',
            }}
          >
            <div
              className="border-b px-3 py-2 font-mono text-[9px] uppercase tracking-[0.18em]"
              style={{ borderColor: 'var(--wp-border)', color: 'var(--wp-text-faint)' }}
            >
              Display currency
            </div>
            <ul className="max-h-[320px] overflow-y-auto py-1">
              {CURRENCY_LIST.map((c) => {
                const isActive = c.code === code;
                return (
                  <li key={c.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => pick(c.code)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
                      style={{
                        background: isActive
                          ? 'color-mix(in srgb, var(--wp-accent) 14%, transparent)'
                          : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.background =
                            'color-mix(in srgb, var(--wp-surface-2) 80%, transparent)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                      }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden>
                        {c.flag}
                      </span>
                      <span
                        className="flex-1"
                        style={{ fontSize: 13, fontWeight: 500, color: 'var(--wp-text)' }}
                      >
                        {c.name}
                      </span>
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 11,
                          fontWeight: 600,
                          color: isActive ? 'var(--wp-accent)' : 'var(--wp-text-faint)',
                        }}
                      >
                        {c.code}
                      </span>
                      {isActive && <Check size={13} strokeWidth={2.4} style={{ color: 'var(--wp-accent)' }} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
