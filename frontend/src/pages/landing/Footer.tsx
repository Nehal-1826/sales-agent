import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useT } from '@/lib/i18n';

const COLUMNS: { titleKey: string; links: { labelKey: string; to: string; external?: boolean }[] }[] = [
  {
    titleKey: 'footer.col.product',
    links: [
      { labelKey: 'footer.link.features', to: '/#product' },
      { labelKey: 'footer.link.pricing', to: '/#pricing' },
      { labelKey: 'footer.link.faq', to: '/how-it-works' },
    ],
  },
  {
    titleKey: 'footer.col.company',
    links: [
      { labelKey: 'footer.link.contact', to: 'mailto:hello@warmpulse.tech', external: true },
    ],
  },
  {
    titleKey: 'footer.col.legal',
    links: [
      { labelKey: 'footer.link.terms', to: '/terms' },
      { labelKey: 'footer.link.privacy', to: '/privacy' },
    ],
  },
];

export function Footer() {
  const t = useT();
  return (
    <footer className="relative border-t border-border-muted bg-bg/40 px-6 pt-20 pb-10">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
                <Zap className="h-4 w-4" />
              </span>
              <span className="font-semibold tracking-tight">WarmPulse</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-text-dim">
              {t('footer.tagline')}
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.titleKey}>
              <h4 className="font-mono text-[11px] uppercase tracking-[0.2em] text-text">
                {t(col.titleKey)}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.labelKey}>
                    {l.external ? (
                      <a
                        href={l.to}
                        className="text-sm text-text-dim transition-colors hover:text-accent"
                      >
                        {t(l.labelKey)}
                      </a>
                    ) : (
                      <Link
                        to={l.to}
                        className="text-sm text-text-dim transition-colors hover:text-accent"
                      >
                        {t(l.labelKey)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-start gap-2 border-t border-border-muted pt-6 text-xs text-text-dim md:flex-row md:items-center md:justify-between">
          <p>{t('footer.copyright')}</p>
          <p className="font-mono">{t('footer.version')}</p>
        </div>
      </div>
    </footer>
  );
}
