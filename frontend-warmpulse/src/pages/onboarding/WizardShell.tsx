import { type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
  TooltipProvider,
} from '@/components/ui/AppTooltip';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

interface WizardShellProps {
  step: number;
  totalSteps: number;
  title: string;
  description?: string;
  children: ReactNode;
  /** Optional custom node rendered instead of the default Back/Next pair (e.g. step 6 finish). */
  footer?: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  canGoBack?: boolean;
  canAdvance?: boolean;
  /** When present renders a "Skip" link between Back and Next. */
  onSkip?: () => void;
  skipLabel?: string;
  /** If set, overrides the default "Continue" button label on this step. */
  nextLabel?: string;
  /** Disables the Next button (e.g. step not yet valid). */
  nextDisabled?: boolean;
  /** Shows an inline spinner on Next — used when the step is submitting. */
  nextLoading?: boolean;
  /** Optional tooltip shown when Next is disabled (explains why). */
  nextDisabledTooltip?: string;
}

export function WizardShell({
  step,
  totalSteps,
  title,
  description,
  children,
  footer,
  onBack,
  onNext,
  canGoBack,
  canAdvance = true,
  onSkip,
  skipLabel,
  nextLabel,
  nextDisabled = false,
  nextLoading = false,
  nextDisabledTooltip,
}: WizardShellProps) {
  const t = useT();
  const displayNextLabel = nextLabel ?? t('onb.shell.continue');
  const displaySkipLabel = skipLabel ?? t('onb.shell.skip');
  const isNextDisabled = nextDisabled || nextLoading || !canAdvance;
  const nextButton = (
    <Button
      onClick={onNext}
      disabled={isNextDisabled}
      rightIcon={nextLoading ? undefined : <ArrowRight className="h-4 w-4" />}
    >
      {nextLoading ? t('onb.shell.working') : displayNextLabel}
    </Button>
  );
  const dots = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div
        className="space-y-2"
        role="group"
        aria-label={t('onb.shell.progress', { step, total: totalSteps })}
      >
        <div className="flex items-center justify-between text-xs text-text-dim">
          <span aria-live="polite">
            {t('onb.shell.stepOf', { step, total: totalSteps })}
          </span>
          <span>{Math.round((step / totalSteps) * 100)}%</span>
        </div>
        <ol
          className="flex items-center gap-2"
          aria-label={t('onb.shell.wizardSteps')}
        >
          {dots.map((n) => {
            const completed = n < step;
            const active = n === step;
            return (
              <li key={n} className="flex-1">
                <span
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'block h-1.5 w-full rounded-full transition-colors',
                    completed && 'bg-gradient-to-r from-accent to-accent2',
                    active && 'bg-accent animate-pulse',
                    !completed && !active && 'bg-surface-2',
                  )}
                />
              </li>
            );
          })}
        </ol>
      </div>

      <Card>
        <div className="p-5 border-b border-border-muted">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-text-dim">{description}</p>
          ) : null}
        </div>
        <CardContent>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </CardContent>

        <div className="flex items-center justify-between border-t border-border-muted p-5">
          {footer ?? (
            <>
              <Button
                variant="ghost"
                onClick={onBack}
                disabled={!canGoBack}
                leftIcon={<ArrowLeft className="h-4 w-4" />}
              >
                {t('onb.shell.back')}
              </Button>

              <div className="flex items-center gap-3">
                {onSkip ? (
                  <button
                    type="button"
                    onClick={onSkip}
                    className="text-sm text-text-dim hover:text-text underline-offset-4 hover:underline focus-ring rounded"
                  >
                    {displaySkipLabel}
                  </button>
                ) : null}
                {isNextDisabled && nextDisabledTooltip ? (
                  <TooltipProvider delayDuration={150}>
                    <AppTooltip>
                      <AppTooltipTrigger asChild>
                        {/* Wrap in span so Radix can attach the trigger on a disabled button */}
                        <span tabIndex={0}>{nextButton}</span>
                      </AppTooltipTrigger>
                      <AppTooltipContent side="top">
                        {nextDisabledTooltip}
                      </AppTooltipContent>
                    </AppTooltip>
                  </TooltipProvider>
                ) : (
                  nextButton
                )}
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
