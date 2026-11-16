import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { useLocaleStore } from '@/stores/locale';
import { COUNTRY_STANDARDS, standardById, type StandardId } from '@/lib/countries';

/**
 * Country/locale selector. Picking a standard sets currency + number/date
 * format + UI language together (via useLocaleStore.setStandard). Replaces the
 * currency-only switcher in the landing nav.
 */
export function CountrySwitcher({ className = '' }: { className?: string }) {
  const standardId = useLocaleStore((s) => s.standardId);
  const setStandard = useLocaleStore((s) => s.setStandard);
  const active = standardById(standardId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: StandardId) => {
    setStandard(id);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Country: ${active.label}`}
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
          {active.currency}
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
            className="absolute right-0 top-full z-50 mt-2 w-[240px] overflow-hidden rounded-xl"
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
              Country &amp; language
            </div>
            <ul className="max-h-[340px] overflow-y-auto py-1">
              {COUNTRY_STANDARDS.map((s) => {
                const isActive = s.id === standardId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => pick(s.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
                      style={{
                        background: isActive ? 'color-mix(in srgb, var(--wp-accent) 14%, transparent)' : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden>
                        {s.flag}
                      </span>
                      <span className="flex-1" style={{ fontSize: 13, fontWeight: 500, color: 'var(--wp-text)' }}>
                        {s.label}
                      </span>
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 11,
                          fontWeight: 600,
                          color: isActive ? 'var(--wp-accent)' : 'var(--wp-text-faint)',
                        }}
                      >
                        {s.currency}
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
