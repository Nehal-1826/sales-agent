import { AlertTriangle, MessageSquare, Palette, Shuffle, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

type Mode = 'A' | 'B' | 'C' | 'D';

interface ModeOption {
  id: Mode;
  titleKey: string;
  summaryKey: string;
  detailKey: string;
  icon: LucideIcon;
  flags?: { labelKey: string; tone: 'warn' | 'good' }[];
}

const MODES: ModeOption[] = [
  {
    id: 'A',
    titleKey: 'onb.content.modeATitle',
    summaryKey: 'onb.content.modeASummary',
    detailKey: 'onb.content.modeADetail',
    icon: MessageSquare,
    flags: [{ labelKey: 'onb.content.flagRecommended', tone: 'good' }],
  },
  {
    id: 'B',
    titleKey: 'onb.content.modeBTitle',
    summaryKey: 'onb.content.modeBSummary',
    detailKey: 'onb.content.modeBDetail',
    icon: Palette,
    flags: [{ labelKey: 'onb.content.flagWarn', tone: 'warn' }],
  },
  {
    id: 'C',
    titleKey: 'onb.content.modeCTitle',
    summaryKey: 'onb.content.modeCSummary',
    detailKey: 'onb.content.modeCDetail',
    icon: Shuffle,
  },
  {
    id: 'D',
    titleKey: 'onb.content.modeDTitle',
    summaryKey: 'onb.content.modeDSummary',
    detailKey: 'onb.content.modeDDetail',
    icon: Wrench,
  },
];

interface Step5ContentModeProps {
  value: Mode | null;
  onChange: (mode: Mode) => void;
}

export function Step5ContentMode({ value, onChange }: Step5ContentModeProps) {
  const t = useT();
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-dim">
        {t('onb.content.desc')}
      </p>

      <div role="radiogroup" aria-label={t('onb.content.ariaLabel')} className="grid gap-3 sm:grid-cols-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          const selected = value === m.id;
          const warning = m.flags?.find((f) => f.tone === 'warn');
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(m.id)}
              className={cn(
                'text-left rounded-lg border p-4 transition-all focus-ring',
                'hover:border-accent/50',
                selected
                  ? 'border-accent bg-accent/5 shadow-glow'
                  : 'border-border-muted bg-surface',
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                    selected ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-dim',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text">{t(m.titleKey)}</span>
                    {m.flags?.map((f) =>
                      f.tone === 'good' ? (
                        <Badge key={f.labelKey} variant="green">
                          {t(f.labelKey)}
                        </Badge>
                      ) : null,
                    )}
                  </div>
                  <div className="mt-1 text-xs text-text-dim">{t(m.summaryKey)}</div>
                  <div className="mt-2 text-[11px] leading-relaxed text-text-dim">
                    {t(m.detailKey)}
                  </div>
                  {warning ? (
                    <div className="mt-2 flex items-start gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{t(warning.labelKey)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
