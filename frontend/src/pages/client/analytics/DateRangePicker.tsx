import { useCallback, useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';

export type DateRangePreset = '7d' | '30d' | '90d' | 'custom';

export interface DateRangeValue {
  preset: DateRangePreset;
  from: string;
  to: string;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  className?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function rangeForPreset(preset: Exclude<DateRangePreset, 'custom'>): DateRangeValue {
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  return { preset, from: isoDate(from), to: isoDate(to) };
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const presets: Array<{ key: Exclude<DateRangePreset, 'custom'>; label: string }> = useMemo(
    () => [
      { key: '7d', label: '7d' },
      { key: '30d', label: '30d' },
      { key: '90d', label: '90d' },
    ],
    [],
  );

  const handlePreset = useCallback(
    (preset: Exclude<DateRangePreset, 'custom'>) => {
      onChange(rangeForPreset(preset));
      setOpen(false);
    },
    [onChange],
  );

  const handleCustomField = useCallback(
    (key: 'from' | 'to', next: string) => {
      onChange({ ...value, preset: 'custom', [key]: next });
    },
    [onChange, value],
  );

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="inline-flex rounded-lg border border-border-muted bg-surface p-1">
        {presets.map((p) => {
          const active = value.preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePreset(p.key)}
              className={cn(
                'h-7 rounded-md px-3 text-xs font-medium transition-colors',
                active ? 'bg-accent text-bg' : 'text-text-dim hover:text-text',
              )}
              aria-pressed={active}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex h-7 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors',
            value.preset === 'custom' ? 'bg-accent2 text-bg' : 'text-text-dim hover:text-text',
          )}
          aria-expanded={open}
        >
          <Calendar className="h-3.5 w-3.5" />
          Custom
        </button>
      </div>

      {open ? (
        <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface p-2">
          <Input
            type="date"
            className="h-8 w-[140px] text-xs"
            value={value.from}
            onChange={(e) => handleCustomField('from', e.target.value)}
            aria-label="From date"
          />
          <span className="text-xs text-text-dim">to</span>
          <Input
            type="date"
            className="h-8 w-[140px] text-xs"
            value={value.to}
            onChange={(e) => handleCustomField('to', e.target.value)}
            aria-label="To date"
          />
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      ) : null}
    </div>
  );
}
