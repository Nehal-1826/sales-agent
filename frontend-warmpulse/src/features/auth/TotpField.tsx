import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

interface TotpFieldProps {
  /** Concatenated digit string (0–6 chars). */
  value: string;
  onChange: (value: string) => void;
  /** Called when the user completes all 6 digits (optional — parent may also submit manually). */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  className?: string;
}

const LENGTH = 6;

/**
 * 6-box TOTP input with:
 *   - auto-advance on digit entry
 *   - backspace-to-previous
 *   - arrow-key navigation
 *   - paste-of-6 fills all boxes
 *
 * Emits `onChange(concatenated)` on every keystroke; parent owns the state.
 * Uncontrolled digits internally so single-key events don't fight React re-renders.
 */
export function TotpField({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  id,
  className,
}: TotpFieldProps) {
  const [digits, setDigits] = useState<string[]>(() => splitValue(value));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  // Re-sync when parent forcibly resets the value (e.g. clears on error).
  useEffect(() => {
    const next = splitValue(value);
    setDigits((prev) => (prev.join('') === next.join('') ? prev : next));
  }, [value]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const emit = (next: string[]) => {
    setDigits(next);
    const joined = next.join('');
    onChange(joined);
    if (joined.length === LENGTH && !next.includes('')) onComplete?.(joined);
  };

  const handleChange = (i: number, raw: string) => {
    // Only keep digits. If the user typed multiple (e.g. autofill), distribute.
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      const next = [...digits];
      next[i] = '';
      emit(next);
      return;
    }
    if (clean.length === 1) {
      const next = [...digits];
      next[i] = clean;
      emit(next);
      if (i < LENGTH - 1) refs.current[i + 1]?.focus();
    } else {
      // Multi-char — spill into subsequent boxes.
      const next = [...digits];
      for (let k = 0; k < clean.length && i + k < LENGTH; k++) {
        next[i + k] = clean[k] ?? '';
      }
      emit(next);
      const nextFocus = Math.min(i + clean.length, LENGTH - 1);
      refs.current[nextFocus]?.focus();
    }
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        // Clear current cell; stay here.
        const next = [...digits];
        next[i] = '';
        emit(next);
      } else if (i > 0) {
        // Empty cell — jump back and clear previous.
        const next = [...digits];
        next[i - 1] = '';
        emit(next);
        refs.current[i - 1]?.focus();
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && i < LENGTH - 1) {
      refs.current[i + 1]?.focus();
      e.preventDefault();
    }
  };

  const handlePaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    e.preventDefault();
    const next = [...digits];
    for (let k = 0; k < pasted.length && i + k < LENGTH; k++) {
      next[i + k] = pasted[k] ?? '';
    }
    emit(next);
    const nextFocus = Math.min(i + pasted.length, LENGTH - 1);
    refs.current[nextFocus]?.focus();
  };

  return (
    <div
      id={id}
      className={cn('flex items-center justify-between gap-2', className)}
      role="group"
      aria-label="One-time verification code"
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Digit ${i + 1}`}
          className={cn(
            'h-12 w-full max-w-[3rem] rounded-lg border border-border-muted bg-surface',
            'text-center font-mono text-lg text-text',
            'focus-ring focus:border-accent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'tabular-nums',
          )}
        />
      ))}
    </div>
  );
}

function splitValue(v: string): string[] {
  const padded = (v || '').slice(0, LENGTH).padEnd(LENGTH, '\0');
  return Array.from(padded).map((c) => (c === '\0' ? '' : c));
}
