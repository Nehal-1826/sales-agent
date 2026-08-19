import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { Check, Copy, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/AppToast';
import {
  usePreflightCheck,
  type PreflightCheckResult,
} from '@/features/mailboxes/useCreateMailbox';
import { useT, type TFunc } from '@/lib/i18n';

interface Step2bServerCheckProps {
  smtpHost: string | null;
  smtpPort: number | null;
  /** Mailbox username/email — sent so the backend can log which account this
   *  preflight was for. Never the password: this step runs before the user
   *  has necessarily typed one in, so a self-hoster can fix infrastructure
   *  first and worry about credentials second. */
  username: string | null;
  /** Tells the shell whether Next is allowed — true once the server passes,
   *  or once the preflight endpoint itself is unavailable (degrade path). */
  onValidityChange: (valid: boolean) => void;
}

type Mode = 'idle' | 'running' | 'result' | 'unavailable';

// Heuristic for "does this remedy contain something copy-pasteable" — a shell
// command, a DNS record, or similar — vs. plain prose that just needs reading.
const COPYABLE_REMEDY = /`|\$\s|ufw |certbot|ports:|dig \+|v=spf1|CNAME|TXT record|systemctl|docker /i;

function looksCopyable(remedy: string): boolean {
  return COPYABLE_REMEDY.test(remedy);
}

function copy(value: string, t: TFunc) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    toast.error(t('onb.dns.clipboardUnavail'));
    return;
  }
  navigator.clipboard.writeText(value).then(
    () => toast.success(t('onb.dns.copiedClipboard')),
    () => toast.error(t('onb.dns.copyFailed')),
  );
}

/**
 * Self-hosted mail-server preflight step. Sits between provider selection
 * and the credentials form, and is rendered only for the `self_hosted`
 * provider (OnboardingWizard gates on that — see the comment there).
 *
 * Renders ONLY `blocking`, never the full `checks` array. This feature
 * exists because a self-hoster typed their Docker service name into the host
 * field and got told their password was wrong. Showing six problems at once
 * instead of one is the same failure in a different costume — see the
 * backend ladder in app.services.mailbox_preflight for why it stops at the
 * first blocking rung.
 */
export function Step2bServerCheck({
  smtpHost,
  smtpPort,
  username,
  onValidityChange,
}: Step2bServerCheckProps) {
  const t = useT();
  const preflight = usePreflightCheck();
  const [mode, setMode] = useState<Mode>('idle');
  const [blocking, setBlocking] = useState<PreflightCheckResult | null>(null);

  const canRun = !!smtpHost && !!smtpPort;

  const run = () => {
    if (!canRun) return;
    setMode('running');
    setBlocking(null);
    preflight.mutate(
      {
        smtp_host: smtpHost!,
        smtp_port: smtpPort!,
        username: username ?? '',
      },
      {
        onSuccess: (res) => {
          setBlocking(res.ok ? null : res.blocking);
          setMode('result');
        },
        onError: () => {
          // 404 (endpoint not deployed yet) or any transport error — degrade
          // rather than block the user from continuing at all.
          setMode('unavailable');
        },
      },
    );
  };

  // Auto-kick the check on mount, same as Step4DnsCheck.
  useEffect(() => {
    if (mode === 'idle' && canRun) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smtpHost, smtpPort]);

  const passed = mode === 'result' && !blocking;

  useEffect(() => {
    onValidityChange(passed || mode === 'unavailable');
  }, [passed, mode, onValidityChange]);

  if (!canRun) {
    return (
      <div className="rounded-lg border border-border-muted p-4 text-sm text-text-dim">
        {t('onb.pf.missing')}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-dim">{t('onb.pf.desc')}</p>

      {mode === 'running' ? (
        <div className="flex items-center gap-3 rounded-lg border border-border-muted bg-surface p-4 text-sm text-text-dim">
          <Spinner size={16} />
          {t('onb.pf.checking')}
        </div>
      ) : null}

      {mode === 'unavailable' ? (
        <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">{t('onb.pf.unavailTitle')}</p>
              <p className="text-xs text-amber-200/80">{t('onb.pf.unavailDesc')}</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={run} leftIcon={<RefreshCw className="h-4 w-4" />}>
            {t('onb.dns.tryAgain')}
          </Button>
        </div>
      ) : null}

      {mode === 'result' && !blocking ? (
        <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm text-accent">
          <Check className="h-4 w-4" />
          {t('onb.pf.allGood')}
        </div>
      ) : null}

      {mode === 'result' && blocking ? (
        <div className="space-y-3 rounded-lg border border-accent3/30 bg-accent3/5 p-4">
          <div className="flex items-start gap-2 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent3" />
            <div className="space-y-1">
              <p className="font-semibold text-text">{t(`onb.pf.${blocking.id}`)}</p>
              <p className="text-xs text-text-dim">{blocking.detail}</p>
            </div>
          </div>

          {blocking.remedy ? (
            looksCopyable(blocking.remedy) ? (
              <div className="space-y-1.5">
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-surface-2 px-3 py-2 font-mono text-xs text-text">
                  {blocking.remedy}
                </pre>
                <button
                  type="button"
                  onClick={() => copy(blocking.remedy as string, t)}
                  className="inline-flex h-6 items-center gap-1 rounded border border-border-muted bg-surface-2 px-2 text-[11px] text-text-dim hover:text-text focus-ring"
                >
                  <Copy className="h-3 w-3" />
                  {t('onb.dns.copy')}
                </button>
              </div>
            ) : (
              <p className="text-sm text-text-dim">{blocking.remedy}</p>
            )
          ) : null}

          <div className="flex justify-start">
            <Button size="sm" variant="ghost" onClick={run} leftIcon={<RefreshCw className="h-4 w-4" />}>
              {t('onb.pf.recheck')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
