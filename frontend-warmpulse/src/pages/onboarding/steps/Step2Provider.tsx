import { Mail, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

type Provider = 'gmail' | 'outlook' | 'outlook_oauth' | 'yahoo' | 'zoho' | 'smtp' | 'self_hosted';

interface ProviderOption {
  id: Provider;
  name: string;
  subtitleKey: string;
  auth: 'oauth' | 'smtp';
  recommended?: boolean;
  accent: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'gmail',
    name: 'Gmail / Google Workspace',
    subtitleKey: 'onb.prov.sub.gmail',
    auth: 'oauth',
    recommended: true,
    accent: 'text-accent',
  },
  {
    id: 'outlook',
    name: 'Outlook / Office 365',
    subtitleKey: 'onb.prov.sub.outlook',
    auth: 'smtp',
    accent: 'text-accent',
  },
  {
    id: 'yahoo',
    name: 'Yahoo',
    subtitleKey: 'onb.prov.sub.yahoo',
    auth: 'smtp',
    accent: 'text-accent',
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    subtitleKey: 'onb.prov.sub.zoho',
    auth: 'smtp',
    accent: 'text-orange-400',
  },
  {
    id: 'smtp',
    name: 'Generic SMTP / IMAP',
    subtitleKey: 'onb.prov.sub.smtp',
    auth: 'smtp',
    accent: 'text-emerald-400',
  },
  {
    id: 'self_hosted',
    name: 'Self-hosted mail server',
    subtitleKey: 'onb.prov.sub.self_hosted',
    auth: 'smtp',
    accent: 'text-sky-400',
  },
];

interface Step2ProviderProps {
  value: Provider | null;
  onChange: (p: Provider) => void;
}

export function Step2Provider({ value, onChange }: Step2ProviderProps) {
  const t = useT();
  return (
    <div className="space-y-6">
      <p className="text-sm text-text-dim">
        {t('onb.prov.desc')}
      </p>

      <div
        role="radiogroup"
        aria-label={t('onb.prov.ariaLabel')}
        className="grid gap-3 sm:grid-cols-2"
      >
        {PROVIDERS.map((p) => {
          const selected = value === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(p.id)}
              className={cn(
                'text-left rounded-lg border p-4 transition-all focus-ring',
                'hover:border-accent/50',
                selected
                  ? 'border-accent bg-accent/5 shadow-glow'
                  : 'border-border-muted bg-surface',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex h-10 w-10 items-center justify-center rounded-md',
                      'bg-surface-2',
                    )}
                  >
                    <Mail className={cn('h-5 w-5', p.accent)} aria-hidden />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text">{p.name}</span>
                      {p.recommended ? (
                        <Badge variant="green" className="gap-1">
                          <Sparkles className="h-3 w-3" />
                          {t('onb.prov.recommended')}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-text-dim">{t(p.subtitleKey)}</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 text-[11px] uppercase tracking-wider text-text-dim">
                {p.auth === 'oauth' ? t('onb.prov.oauth') : t('onb.prov.smtp')}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
