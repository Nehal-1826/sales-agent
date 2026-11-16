export interface MeterBarProps {
  /** 0–100 */
  value: number;
  /** Override fill color; defaults to accent, success when >=70, warn when <40. */
  color?: string;
  showValue?: boolean;
}

export function MeterBar({ value, color, showValue = true }: MeterBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = color ?? (pct >= 70 ? 'var(--wp-success, #3ddc97)' : pct < 40 ? 'var(--wp-accent-2, #FF8A4B)' : 'var(--wp-accent)');
  return (
    <span className="ag-meter">
      <span className="ag-meter__track"><span className="ag-meter__fill" style={{ width: `${pct}%`, background: fill }} /></span>
      {showValue && <span className="ag-meter__val">{Math.round(pct)}</span>}
    </span>
  );
}
