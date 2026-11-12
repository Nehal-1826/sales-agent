export type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral';

export interface StatusPillProps {
  label: string;
  tone?: StatusTone;
}

export function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
  return (
    <span className={`ag-pill ag-pill--${tone}`}>
      <span className="ag-pill__dot" aria-hidden />
      {label}
    </span>
  );
}
