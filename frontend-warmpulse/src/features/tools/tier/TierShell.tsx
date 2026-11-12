/**
 * Page frame for the redesigned Tools landing. Renders the tier's header,
 * optional premium chrome (gradient hero + glow for Agency), and a motion
 * wrapper whose intensity scales with the tier. Children are the launcher
 * plus any tier-specific extras.
 */
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Command } from 'lucide-react';
import type { TierConfig, MotionLevel } from './tierTheme';

function motionProps(level: MotionLevel) {
  switch (level) {
    case 'none':
      return {};
    case 'subtle':
      return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25 } };
    case 'reveal':
      return {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: 'easeOut' as const },
      };
    case 'spring':
      return {
        initial: { opacity: 0, y: 18, scale: 0.99 },
        animate: { opacity: 1, y: 0, scale: 1 },
        transition: { type: 'spring' as const, stiffness: 180, damping: 22 },
      };
  }
}

export function TierShell({
  config,
  toolbar,
  children,
}: {
  config: TierConfig;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.div {...motionProps(config.motion)} className="space-y-6">
      {/* Header */}
      <header
        className={
          config.glow
            ? 'relative overflow-hidden rounded-3xl border border-border-muted p-6'
            : ''
        }
      >
        {config.glow && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-90"
              style={{
                background:
                  'radial-gradient(120% 140% at 15% -20%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 60%), radial-gradient(120% 140% at 95% 0%, color-mix(in srgb, #9b50ff 22%, transparent), transparent 55%)',
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full blur-3xl"
              style={{ background: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}
            />
          </>
        )}
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              className={
                config.glow
                  ? 'bg-gradient-to-r from-accent via-accent4 to-accent3 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent'
                  : 'text-2xl font-bold tracking-tight text-text'
              }
            >
              {config.title}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-text-dim">{config.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {config.commandBar && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface/60 px-2.5 py-1.5 text-xs text-text-dim">
                <Command className="h-3.5 w-3.5" /> K
              </span>
            )}
            {toolbar}
          </div>
        </div>
      </header>

      {children}
    </motion.div>
  );
}
