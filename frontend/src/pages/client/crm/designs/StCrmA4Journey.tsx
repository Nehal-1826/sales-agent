import { motion } from 'framer-motion';
import {
  Flame,
  MailCheck,
  KanbanSquare,
  Trophy,
  Lock,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  LineChart,
  Repeat2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

type Step = {
  icon: typeof Flame;
  title: string;
  tone: string;
  body: string;
  state: 'done' | 'locked';
};

type Outcome = { icon: typeof Flame; title: string; body: string };

const steps: Step[] = [
  {
    icon: Flame,
    title: 'Warm your inbox',
    tone: 'Active on Starter',
    body: 'Peer inboxes send, open and reply to build sender reputation every day.',
    state: 'done',
  },
  {
    icon: MailCheck,
    title: 'Land in the inbox',
    tone: 'Active on Starter',
    body: 'Engagement signal keeps you out of spam so real replies arrive.',
    state: 'done',
  },
  {
    icon: KanbanSquare,
    title: 'Track every lead',
    tone: 'Paid add-on',
    body: 'Kanban pipeline, deal values, activity timeline, sequences.',
    state: 'locked',
  },
  {
    icon: Trophy,
    title: 'Close the deal',
    tone: 'Paid add-on',
    body: 'Watch won revenue roll up per campaign.',
    state: 'locked',
  },
];

const outcomes: Outcome[] = [
  {
    icon: ShieldCheck,
    title: 'Never lose a reply',
    body: 'Every warmed-up response lands on a board instead of buried in a thread.',
  },
  {
    icon: LineChart,
    title: 'See won revenue roll up',
    body: 'Deal values aggregate per campaign so you know what each mailbox earns.',
  },
  {
    icon: Repeat2,
    title: 'Automate the follow-ups',
    body: 'Multi-step sequences fire off the inbox you are already warming.',
  },
];

const SUCCESS = 'var(--wp-success,#3ddc97)';

function DoneBadge() {
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border"
      style={{
        color: SUCCESS,
        borderColor: 'color-mix(in srgb, var(--wp-success,#3ddc97) 45%, transparent)',
        background: 'color-mix(in srgb, var(--wp-success,#3ddc97) 14%, transparent)',
      }}
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden>
        <path
          d="M4 10.5l4 4 8-9"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function StCrmA4Journey() {
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.08] px-3 py-1 text-xs font-medium text-accent">
          <Sparkles className="h-4 w-4" strokeWidth={2.2} />
          Paid add-on
        </span>
        <h1 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-text md:text-4xl">
          From cold send to closed deal
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-text-dim">
          You're already warming the inbox. The CRM is the next two steps — track every lead and
          close it.
        </p>
      </motion.header>

      {/* 4-STEP JOURNEY */}
      <div className="relative">
        {/* progress line behind the cards (desktop) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[12%] top-7 hidden h-px md:block"
          style={{
            background:
              'linear-gradient(to right, color-mix(in srgb, var(--wp-success,#3ddc97) 50%, transparent) 0%, color-mix(in srgb, var(--wp-success,#3ddc97) 50%, transparent) 45%, color-mix(in srgb, var(--wp-accent,#F26522) 50%, transparent) 55%, color-mix(in srgb, var(--wp-accent,#F26522) 50%, transparent) 100%)',
          }}
        />
        <ol className="relative grid grid-cols-1 gap-4 md:grid-cols-4">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const locked = step.state === 'locked';
            return (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.12 + i * 0.12 }}
                className={`relative flex flex-col rounded-2xl border p-5 ${
                  locked
                    ? 'border-accent/40 bg-accent/[0.04]'
                    : 'border-border-muted bg-surface'
                }`}
              >
                {/* connector arrow to next step (desktop) */}
                {i < steps.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute -right-[11px] top-7 z-10 hidden -translate-y-1/2 text-text-faint md:block"
                  >
                    <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
                  </span>
                )}

                <div className="flex items-start justify-between">
                  <span
                    className={`relative inline-flex h-14 w-14 items-center justify-center rounded-2xl border ${
                      locked
                        ? 'border-accent/30 bg-accent/[0.10] text-accent'
                        : 'border-border-muted bg-surface-2 text-text'
                    }`}
                    style={
                      locked
                        ? {
                            boxShadow:
                              '0 0 24px color-mix(in srgb, var(--wp-accent,#F26522) 28%, transparent)',
                          }
                        : undefined
                    }
                  >
                    <Icon className={locked ? 'h-6 w-6 opacity-90' : 'h-6 w-6'} strokeWidth={2} />
                    {locked && (
                      <span className="absolute -bottom-1.5 -right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-accent/40 bg-bg text-accent">
                        <Lock className="h-3 w-3" strokeWidth={2.4} />
                      </span>
                    )}
                  </span>
                  {step.state === 'done' ? (
                    <DoneBadge />
                  ) : (
                    <span className="rounded-full border border-accent/30 bg-accent/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                      Paid add-on
                    </span>
                  )}
                </div>

                <div className="mt-4 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                  Step {i + 1}
                </div>
                <h3 className="mt-1 text-base font-semibold text-text">{step.title}</h3>
                <p
                  className="mt-0.5 text-xs font-medium"
                  style={step.state === 'done' ? { color: SUCCESS } : undefined}
                >
                  {step.state === 'locked' ? <span className="text-accent">{step.tone}</span> : step.tone}
                </p>
                <p className={`mt-2.5 text-sm leading-relaxed ${locked ? 'text-text-dim' : 'text-text-dim'}`}>
                  {step.body}
                </p>
              </motion.li>
            );
          })}
        </ol>
      </div>

      {/* OUTCOME STRIP */}
      <div className="grid gap-4 md:grid-cols-3">
        {outcomes.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 + i * 0.08 }}
              className="rounded-2xl border border-border-muted bg-surface p-5 transition-colors hover:border-accent/40"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/[0.08] text-accent">
                <Icon className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-text">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-dim">{item.body}</p>
            </motion.div>
          );
        })}
      </div>

      {/* CLOSING CTA BAND */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.78 }}
        className="relative overflow-hidden rounded-3xl border border-accent/30 bg-accent/[0.05] p-8 text-center md:p-10"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in srgb, var(--wp-accent-2, #FF8A4B) 32%, transparent), transparent)',
          }}
        />
        <div className="relative mx-auto max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight text-text md:text-3xl">
            Add the CRM to your account
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-dim">
            Pro 3 campaigns · Pro Plus 10 · Agency unlimited
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/app/billing">
                Add the CRM
                <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link to="/app/billing">Compare plans</Link>
            </Button>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

export default StCrmA4Journey;
