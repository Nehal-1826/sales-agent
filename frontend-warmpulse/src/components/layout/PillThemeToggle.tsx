import { Moon, Sun } from 'lucide-react';
import { useThemeMode } from '@/lib/useThemeMode';

/**
 * Theme switcher styled as a pill row — lives in the floating sidebar footer,
 * just above the profile avatar. Icon-only when the rail is collapsed; the
 * label reveals when the rail expands on hover (see `.admin-pill` CSS).
 */
export function PillThemeToggle() {
  const { theme, toggle } = useThemeMode();
  const goingTo = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      className="admin-pill__toggle"
      aria-label={`Switch to ${goingTo} theme`}
      title={`Switch to ${goingTo} theme`}
    >
      {theme === 'dark' ? (
        <Sun size={14} strokeWidth={2.1} />
      ) : (
        <Moon size={14} strokeWidth={2.1} />
      )}
      <span className="admin-pill__tooltip" role="tooltip">
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </span>
    </button>
  );
}
