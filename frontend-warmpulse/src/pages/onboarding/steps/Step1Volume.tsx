import { useEffect, useState } from 'react';
import { Mail, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

const PRESETS = [
  { value: 5, labelKey: 'onb.vol.p.justStarting', hintKey: 'onb.vol.h.justStarting' },
  { value: 10, labelKey: 'onb.vol.p.cautious', hintKey: 'onb.vol.h.cautious' },
  { value: 20, labelKey: 'onb.vol.p.standard', hintKey: 'onb.vol.h.standard' },
  { value: 50, labelKey: 'onb.vol.p.aggressive', hintKey: 'onb.vol.h.aggressive' },
  { value: 100, labelKey: 'onb.vol.p.high', hintKey: 'onb.vol.h.high' },
];

interface Step1VolumeProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function Step1Volume({ value, onChange }: Step1VolumeProps) {
  const t = useT();
  const matchedPreset = PRESETS.find((p) => p.value === value);
  const [useCustom, setUseCustom] = useState(() => value != null && !matchedPreset);
  const [customValue, setCustomValue] = useState<string>(
    value != null && !matchedPreset ? String(value) : '',
  );

  // Re-sync custom toggle if value gets reset externally.
  useEffect(() => {
    if (value == null) {
      setUseCustom(false);
      setCustomValue('');
    }
  }, [value]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-dim">
        {t('onb.vol.desc')}
      </p>

      <div
        role="radiogroup"
        aria-label={t('onb.vol.ariaGroup')}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {PRESETS.map((p) => {
          const selected = !useCustom && value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setUseCustom(false);
                onChange(p.value);
              }}
              className={cn(
                'text-left rounded-lg border p-4 transition-all focus-ring',
                'hover:border-accent/50',
                selected
                  ? 'border-accent bg-accent/5 shadow-glow'
                  : 'border-border-muted bg-surface',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <Mail
                  className={cn(
                    'h-4 w-4 shrink-0',
                    selected ? 'text-accent' : 'text-text-dim',
                  )}
                />
                {selected ? <Sparkles className="h-4 w-4 text-accent" /> : null}
              </div>
              <div className="mt-2">
                <div className="text-xl font-bold text-text">
                  {p.value}
                  <span className="text-xs font-normal text-text-dim"> {t('onb.vol.day')}</span>
                </div>
                <div className="text-xs font-medium text-text">{t(p.labelKey)}</div>
                <div className="mt-1 text-[11px] text-text-dim">{t(p.hintKey)}</div>
              </div>
            </button>
          );
        })}

        <button
          type="button"
          role="radio"
          aria-checked={useCustom}
          onClick={() => {
            setUseCustom(true);
            if (customValue) {
              const n = Number(customValue);
              if (Number.isFinite(n)) onChange(Math.max(1, Math.min(200, Math.round(n))));
            } else {
              onChange(null);
            }
          }}
          className={cn(
            'text-left rounded-lg border p-4 transition-all focus-ring',
            'hover:border-accent/50',
            useCustom
              ? 'border-accent bg-accent/5 shadow-glow'
              : 'border-border-muted bg-surface',
          )}
        >
          <Mail
            className={cn('h-4 w-4', useCustom ? 'text-accent' : 'text-text-dim')}
          />
          <div className="mt-2">
            <div className="text-xl font-bold text-text">{t('onb.vol.custom')}</div>
            <div className="text-[11px] text-text-dim">
              {t('onb.vol.customHint')}
            </div>
          </div>
        </button>
      </div>

      {useCustom ? (
        <FormField
          label={t('onb.vol.customLabel')}
          htmlFor="custom-volume"
          hint={t('onb.vol.customFieldHint')}
        >
          <Input
            id="custom-volume"
            type="number"
            min={1}
            max={200}
            value={customValue}
            onChange={(e) => {
              setCustomValue(e.target.value);
              const n = Number(e.target.value);
              if (!e.target.value) {
                onChange(null);
                return;
              }
              if (Number.isFinite(n)) {
                onChange(Math.max(1, Math.min(200, Math.round(n))));
              }
            }}
            placeholder={t('onb.vol.customPlaceholder')}
          />
        </FormField>
      ) : null}
    </div>
  );
}
