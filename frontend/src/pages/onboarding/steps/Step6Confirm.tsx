import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { Plan } from '../PlanPicker';
import type { OnboardingDraft } from '../useOnboardingMachine';

interface BackendPlanShape {
  id: string;
  name: string;
}

/** Resolve a plan's display name even if the user landed on Step 6 directly
 *  (refresh, mailbox_pending bounce) and PlanPicker never populated the cache. */
async function fetchPlansForReview(): Promise<Plan[]> {
  try {
    const res = await api.get<BackendPlanShape[] | { plans: BackendPlanShape[] }>('/plans');
    const data = res.data;
    const raw = Array.isArray(data) ? data : Array.isArray(data?.plans) ? data.plans : [];
    return raw.map((p) => ({
      id: p.id,
      name: p.name,
      price_monthly: 0,
      mailbox_limit: 0,
      features: [],
    }));
  } catch {
    return [];
  }
}

interface Step6ConfirmProps {
  draft: OnboardingDraft;
  onFinish: () => void;
  busy?: boolean;
  success?: boolean;
}

const PROVIDER_LABEL_KEYS: Record<NonNullable<OnboardingDraft['provider']>, string> = {
  gmail: 'onb.confirm.provGmail',
  outlook: 'onb.confirm.provOutlook',
  outlook_oauth: 'onb.confirm.provOutlookOauth',
  yahoo: 'onb.confirm.provYahoo',
  zoho: 'onb.confirm.provZoho',
  smtp: 'onb.confirm.provSmtp',
  self_hosted: 'onb.confirm.provSelfHosted',
};

const MODE_LABEL_KEYS: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: 'onb.confirm.modeA',
  B: 'onb.confirm.modeB',
  C: 'onb.confirm.modeC',
  D: 'onb.confirm.modeD',
};

export function Step6Confirm({ draft, onFinish, busy, success }: Step6ConfirmProps) {
  const t = useT();
  const queryClient = useQueryClient();
  // Pull plans from the cache PlanPicker populated; if absent (refresh straight
  // into Step 6, or backend bounced the user via mailbox_pending), re-fetch.
  const cachedPlans = queryClient.getQueryData<Plan[]>(['plans']);
  const { data: fetchedPlans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: fetchPlansForReview,
    enabled: !cachedPlans && !!draft.plan_id,
    staleTime: 5 * 60 * 1000,
  });
  const plans = cachedPlans ?? fetchedPlans;
  const planName = useMemo(() => {
    if (!draft.plan_id) return '—';
    const match = plans?.find((p) => p.id === draft.plan_id)?.name;
    if (match) return match;
    if (plansLoading) return 'Loading…';
    // Last-resort: the user did pick a plan but we can't resolve the name —
    // show the id so the screen is never silently blank.
    return draft.plan_id;
  }, [draft.plan_id, plans, plansLoading]);

  const rows = useMemo(
    () => [
      { label: t('onb.confirm.rowPlan'), value: planName },
      {
        label: t('onb.confirm.rowVolume'),
        value: draft.daily_volume != null
          ? t('onb.confirm.emailsDay', { count: draft.daily_volume })
          : '—',
      },
      {
        label: t('onb.confirm.rowProvider'),
        value: draft.provider ? t(PROVIDER_LABEL_KEYS[draft.provider]) : '—',
      },
      { label: t('onb.confirm.rowEmail'), value: draft.email_address ?? '—' },
      {
        label: t('onb.confirm.rowAuth'),
        value: draft.oauth_token
          ? t('onb.confirm.oauthStored')
          : draft.smtp_host
            ? t('onb.confirm.smtpAuth', {
                host: draft.smtp_host,
                port: draft.smtp_port ?? '',
                imap: draft.imap_host ?? '—',
                imapPort: draft.imap_port ?? '',
              })
            : '—',
      },
      {
        label: t('onb.confirm.rowContent'),
        value: draft.content_mode ? t(MODE_LABEL_KEYS[draft.content_mode]) : '—',
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, planName],
  );

  if (success) {
    return <ConfettiDoneCard />;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-dim">
        {t('onb.confirm.desc')}
      </p>

      <dl className="divide-y divide-border-muted rounded-lg border border-border-muted">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4 p-3 text-sm">
            <dt className="text-text-dim">{r.label}</dt>
            <dd className="text-right font-medium text-text break-all">{r.value}</dd>
          </div>
        ))}
      </dl>

      <Button
        className="w-full"
        size="lg"
        onClick={onFinish}
        disabled={busy}
        leftIcon={<Sparkles className="h-4 w-4" />}
      >
        {busy ? t('onb.confirm.starting') : t('onb.confirm.finish')}
      </Button>
    </div>
  );
}

/** Tiny celebration animation — Framer Motion particles (no extra deps). */
function ConfettiDoneCard() {
  const t = useT();
  return (
    <div className="relative flex flex-col items-center gap-4 py-6 text-center">
      <Particles />
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="relative z-10 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent"
      >
        <CheckCircle2 className="h-7 w-7" />
      </motion.div>
      <div className="relative z-10">
        <h3 className="text-lg font-semibold text-text">{t('onb.confirm.live')}</h3>
        <p className="mt-1 text-sm text-text-dim">{t('onb.confirm.redirecting')}</p>
      </div>
    </div>
  );
}

function Particles() {
  const [particles] = useState(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 300,
      y: (Math.random() - 0.2) * 220,
      delay: Math.random() * 0.2,
      color: ['#4ade80', '#FF9670', '#f472b6', '#fbbf24', '#FF9670'][i % 5],
    })),
  );

  // Hide particles from screen readers so the "live" announcement stays clean.
  useEffect(() => {}, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {particles.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: p.delay, ease: 'easeOut' }}
          className="absolute left-1/2 top-1/2 block h-2 w-2 rounded-full"
          style={{ backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}
