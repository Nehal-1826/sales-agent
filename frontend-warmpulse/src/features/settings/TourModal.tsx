import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Inbox,
  LayoutDashboard,
  Settings as SettingsIcon,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

const STEPS: readonly Step[] = [
  {
    icon: LayoutDashboard,
    title: 'Dashboard',
    body: 'Live warmth score, inbox vs spam split, and today\'s send count for every mailbox in this workspace. Tip: hover the warmth chart to compare days.',
  },
  {
    icon: Inbox,
    title: 'Mailboxes',
    body: 'Connect Gmail / Outlook / SMTP inboxes. Each one builds up automatically: 5 sends on day 1 and up to your daily target by day 29.',
  },
  {
    icon: Activity,
    title: 'Activity',
    body: 'Per-minute timeline of sends, opens, replies, and spam recoveries. Filter by mailbox or action when you\'re debugging inbox delivery.',
  },
  {
    icon: ShieldCheck,
    title: 'Sender trust & Health',
    body: 'Domain records (DNS) health (SPF, DKIM, DMARC), Postmaster + SNDS panels, block list checks, and a six-axis health radar — your full inbox delivery fingerprint.',
  },
  {
    icon: SettingsIcon,
    title: 'Settings',
    body: 'Profile, 2FA, notification rules, API keys (Agency), and replaying this tour. You\'re here now — you\'ve made it.',
  },
];

interface TourModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the user finishes step 5. Use to mark `tour_completed_at`. */
  onComplete?: () => void;
}

/**
 * Five-step product tour modal.
 *
 * Intentionally a popover stepper rather than a Joyride-style overlay
 * because we don't have stable DOM anchors yet — using element selectors
 * across the responsive layouts (sidebar collapses below lg, mobile uses
 * a bottom-nav) would either jitter or miss targets entirely. A modal
 * with descriptive cards reads cleanly on every viewport and ships now.
 */
export function TourModal({ open, onOpenChange, onComplete }: TourModalProps) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const Step = STEPS[step]!;
  const Icon = Step.icon;

  const next = () => {
    if (isLast) {
      onComplete?.();
      onOpenChange(false);
      // Reset for next replay so the user starts on step 1.
      setTimeout(() => setStep(0), 250);
    } else {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent description="WarmPulse product tour">
        <AppDialogHeader>
          <AppDialogTitle>Welcome to WarmPulse</AppDialogTitle>
        </AppDialogHeader>

        {/* Step body — animated swap between cards */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex flex-col items-start gap-4 py-2"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Icon className="h-6 w-6" />
            </span>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-text">{Step.title}</h3>
              <p className="text-sm text-text-dim">{Step.body}</p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Step dots */}
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={
                'h-1.5 rounded-full transition-all ' +
                (i === step ? 'w-6 bg-accent' : 'w-1.5 bg-border-muted')
              }
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={prev}
            disabled={step === 0}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
          <span className="text-xs text-text-dim">
            Step {step + 1} of {STEPS.length}
          </span>
          <Button
            size="sm"
            onClick={next}
            rightIcon={
              isLast ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />
            }
          >
            {isLast ? 'Got it' : 'Next'}
          </Button>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
