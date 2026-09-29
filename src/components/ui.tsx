import type { ReactNode } from 'react';

/** Small shared UI primitives used across all pages. */

/** Loading spinner — centered in its container, matches the dark theme. */
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status" aria-label={label}>
      <div className="spinner" />
      <span className="spinner-label">{label}</span>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="section-label">{children}</div>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warn';
}) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function StatusDot({ tone = 'success', pulse = false }: { tone?: 'success' | 'accent' | 'gray'; pulse?: boolean }) {
  return <span className={`status-dot dot-${tone}${pulse ? ' dot-pulse' : ''}`} aria-hidden />;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
