/**
 * Renders the four Tools entries in the current tier's style:
 *   list (Starter) | cards (Pro) | lab panels (Pro Plus) | glass tiles (Agency)
 *
 * Tools always link to their working sub-route; tools that need a higher tier
 * carry an informational badge but stay clickable — the tool page itself shows
 * a functional upgrade CTA (no dead buttons).
 */
import { Link } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import { TOOLS, tierMeets, type TierConfig, type Tier } from './tierTheme';

const TIER_LABEL: Record<Tier, string> = {
  starter: 'Starter',
  pro: 'Pro',
  pro_plus: 'Pro Plus',
  agency: 'Agency',
};

function GateBadge({ minTier }: { minTier: Tier }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-dim">
      <Lock className="h-3 w-3" /> {TIER_LABEL[minTier]}
    </span>
  );
}

export function ToolLauncher({ config }: { config: TierConfig }) {
  const { shellKind, tier, columns } = config;

  if (shellKind === 'list') {
    return (
      <div className="overflow-hidden rounded-2xl border border-border-muted bg-surface">
        {TOOLS.map((t, i) => {
          const locked = !tierMeets(tier, t.minTier);
          return (
            <Link
              key={t.slug}
              to={t.to}
              className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2 ${
                i > 0 ? 'border-t border-border-muted/60' : ''
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                <t.Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-text">{t.label}</span>
                  {locked && <GateBadge minTier={t.minTier} />}
                </span>
                <span className="block truncate text-sm text-text-dim">{t.desc}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                Open <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          );
        })}
      </div>
    );
  }

  if (shellKind === 'tabs') {
    return (
      <div className={`grid gap-4 ${columns}`}>
        {TOOLS.map((t) => {
          const locked = !tierMeets(tier, t.minTier);
          return (
            <Link
              key={t.slug}
              to={t.to}
              className="group rounded-2xl border border-border-muted bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:bg-surface-2"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <t.Icon className="h-5 w-5" />
                </span>
                {locked && <GateBadge minTier={t.minTier} />}
              </div>
              <div className="mt-4 font-semibold text-text">{t.label}</div>
              <p className="mt-1 text-sm text-text-dim">{t.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                Open <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          );
        })}
      </div>
    );
  }

  if (shellKind === 'lab') {
    return (
      <div className={`grid gap-4 ${columns}`}>
        {TOOLS.map((t) => {
          const locked = !tierMeets(tier, t.minTier);
          return (
            <Link
              key={t.slug}
              to={t.to}
              className="group relative overflow-hidden rounded-2xl border border-border-muted bg-surface-2/40 p-5 transition-all hover:border-accent/50"
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent/0 via-accent to-accent/0"
              />
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent ring-1 ring-accent/20">
                  <t.Icon className="h-5 w-5" />
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-dim">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--wp-accent)]" />
                  live
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="font-semibold text-text">{t.label}</span>
                {locked && <GateBadge minTier={t.minTier} />}
              </div>
              <p className="mt-1 text-sm text-text-dim">{t.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent">
                Open instrument <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          );
        })}
      </div>
    );
  }

  // workbench (Agency)
  return (
    <div className={`grid gap-4 ${columns}`}>
      {TOOLS.map((t) => {
        const locked = !tierMeets(tier, t.minTier);
        return (
          <Link
            key={t.slug}
            to={t.to}
            className="group relative overflow-hidden rounded-2xl border border-border-muted bg-surface-2/40 p-5 backdrop-blur transition-all hover:-translate-y-0.5"
            style={{ boxShadow: '0 1px 0 0 color-mix(in srgb, var(--wp-accent) 12%, transparent) inset' }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: 'color-mix(in srgb, var(--wp-accent) 35%, transparent)' }}
            />
            <div className="relative flex items-center justify-between">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg"
                style={{ background: 'linear-gradient(135deg, var(--wp-accent), #9b50ff)' }}
              >
                <t.Icon className="h-5 w-5" />
              </span>
              {locked && <GateBadge minTier={t.minTier} />}
            </div>
            <div className="relative mt-4 font-semibold text-text">{t.label}</div>
            <p className="relative mt-1 text-sm text-text-dim">{t.desc}</p>
            <span className="relative mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
              Launch <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
