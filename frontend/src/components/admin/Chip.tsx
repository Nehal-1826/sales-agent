export interface ChipProps {
  label: string;
  variant?: 'default' | 'accent';
}

export function Chip({ label, variant = 'default' }: ChipProps) {
  return <span className={`ag-chip ${variant === 'accent' ? 'ag-chip--accent' : ''}`}>{label}</span>;
}
