import { forwardRef, useState, type InputHTMLAttributes, type WheelEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/**
 * Shared text input.
 *
 * Two enhancements over the raw <input>:
 *
 *  1. Password visibility toggle — when `type="password"`, the input is
 *     rendered inside a relatively-positioned wrapper with a right-edge
 *     eye/eye-off button that flips the type to "text". Every password
 *     field in the app (login, signup, peer-inbox SMTP/IMAP, mailbox
 *     connect, …) gets this automatically.
 *
 *  2. Number-input wheel guard — wheel events over a focused
 *     `<input type="number">` increment/decrement the value by default,
 *     which is terrible UX inside scrollable popups. We blur on wheel
 *     so the event falls through to the dialog body's overflow handler.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, onWheel, type, ...props },
  ref,
) {
  // Toggle for the password eye. Lives at the Input level (not in a
  // separate PasswordInput component) so every existing call-site with
  // `type="password"` picks it up with zero edits.
  const isPassword = type === 'password';
  const [reveal, setReveal] = useState(false);
  const effectiveType = isPassword && reveal ? 'text' : type;

  function handleWheel(e: WheelEvent<HTMLInputElement>) {
    if (type === 'number' && document.activeElement === e.currentTarget) {
      e.currentTarget.blur();
    }
    onWheel?.(e);
  }

  const inputEl = (
    <input
      ref={ref}
      type={effectiveType}
      onWheel={handleWheel}
      className={cn(
        'flex h-10 w-full rounded-lg border bg-surface px-3 py-2 text-sm',
        'text-text placeholder:text-text-dim',
        'focus-ring focus:border-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'border-border-muted',
        // Reserve room for the eye button on password fields so the dots
        // don't crash into it.
        isPassword && 'pr-10',
        invalid && 'border-accent3 focus:border-accent3 focus-visible:ring-accent3',
        className,
      )}
      {...props}
    />
  );

  if (!isPassword) return inputEl;

  return (
    <div className="relative">
      {inputEl}
      <button
        type="button"
        onClick={() => setReveal((v) => !v)}
        aria-label={reveal ? 'Hide password' : 'Show password'}
        aria-pressed={reveal}
        tabIndex={-1}
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2',
          'inline-flex h-7 w-7 items-center justify-center rounded-md',
          'text-text-dim transition-colors',
          'hover:bg-surface-2 hover:text-text',
          'focus-visible:outline-none focus-visible:bg-surface-2 focus-visible:text-text',
        )}
      >
        {reveal ? (
          <EyeOff className="h-4 w-4" strokeWidth={2.2} />
        ) : (
          <Eye className="h-4 w-4" strokeWidth={2.2} />
        )}
      </button>
    </div>
  );
});
