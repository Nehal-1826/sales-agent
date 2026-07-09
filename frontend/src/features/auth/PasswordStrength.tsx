import { cn } from '@/lib/cn';
import { passwordStrength } from './schemas';

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

const LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'] as const;

/**
 * Four-bar password strength indicator. Visual hint only — the actual rules
 * live in the zod schema / backend. Colors progress red → orange → yellow → green.
 */
export function PasswordStrength({ password, className }: PasswordStrengthProps) {
  const score = passwordStrength(password);

  // Color ramp per bar, indexed by score.
  const barColors = [
    'bg-accent3', // 1 — red-ish (weak)
    'bg-accent3', // 2 — still warning
    'bg-accent4', // 3 — yellow
    'bg-accent', // 4 — green (strong)
  ];

  const activeColor = score > 0 ? barColors[score - 1] : 'bg-surface-2';

  return (
    <div className={cn('space-y-1', className)} aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < score ? activeColor : 'bg-surface-2',
            )}
          />
        ))}
      </div>
      {score > 0 ? (
        <p className="text-xs text-text-dim">
          Strength: <span className="text-text">{LABELS[score]}</span>
        </p>
      ) : null}
    </div>
  );
}
