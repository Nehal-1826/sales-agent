import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AxiosError } from 'axios';
import { Eye, EyeOff, ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Card, CardContent } from '@/components/ui/Card';
import {
  AppPasswordHelp,
  type AppPasswordProvider,
} from '@/features/mailboxes/AppPasswordHelp';
import { useProbeCredentials } from '@/features/mailboxes/api';
import { env } from '@/lib/env';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { OnboardingDraft } from '../useOnboardingMachine';

type Provider = NonNullable<OnboardingDraft['provider']>;

const smtpSchema = z.object({
  email_address: z.string().email('Valid email required'),
  smtp_host: z.string().min(3, 'SMTP host required'),
  smtp_port: z.coerce.number().int().min(1).max(65535),
  smtp_username: z.string().min(1, 'SMTP username required'),
  smtp_password: z.string().min(1, 'SMTP password required'),
  imap_host: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length >= 3 ? v.trim() : undefined)),
  imap_port: z
    .union([z.coerce.number().int().min(1).max(65535), z.literal('').transform(() => undefined)])
    .optional(),
});

export type SmtpFormValues = z.infer<typeof smtpSchema>;

interface Step3CredentialsProps {
  provider: Provider;
  draft: OnboardingDraft;
  onPatch: (p: Partial<OnboardingDraft>) => void;
  onBackToProvider: () => void;
  /** Called with true whenever the local form is valid and ready to advance. */
  onValidityChange: (valid: boolean) => void;
}

const OAUTH_TIMEOUT_MS = 120_000;

export function Step3Credentials({
  provider,
  draft,
  onPatch,
  onBackToProvider,
  onValidityChange,
}: Step3CredentialsProps) {
  const isOauth = provider === 'gmail' || provider === 'outlook_oauth';

  if (isOauth) {
    return (
      <OauthPanel
        provider={provider}
        draft={draft}
        onPatch={onPatch}
        onBackToProvider={onBackToProvider}
        onValidityChange={onValidityChange}
      />
    );
  }

  // All SMTP-flavoured providers (outlook / yahoo / zoho / generic smtp)
  // render the full credentials form — host, port, username, password, IMAP —
  // with an inline app-password help section per provider.
  return (
    <SmtpPanel
      provider={provider}
      draft={draft}
      onPatch={onPatch}
      onValidityChange={onValidityChange}
    />
  );
}

// ---------------- OAuth ----------------

function OauthPanel({
  provider,
  draft,
  onPatch,
  onBackToProvider,
  onValidityChange,
}: {
  provider: 'gmail' | 'outlook' | 'outlook_oauth' | 'yahoo' | 'smtp';
  draft: OnboardingDraft;
  onPatch: (p: Partial<OnboardingDraft>) => void;
  onBackToProvider: () => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'pending' | 'timeout' | 'unavailable' | 'done'>(
    draft.oauth_token ? 'done' : 'idle',
  );
  const popupRef = useRef<Window | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onValidityChange(!!draft.oauth_token);
  }, [draft.oauth_token, onValidityChange]);

  const cleanup = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(() => {
    setState('pending');
    const provName =
      provider === 'gmail' ? 'google' : 'microsoft';
    const url = `${env.VITE_API_BASE_URL}/auth/${provName}/oauth-start?intent=mailbox`;

    // Probe endpoint before popping open. If the route 404s, we degrade gracefully —
    // the user can go back to Step 2 and pick SMTP/IMAP instead.
    const popup = window.open(url, 'warmpulse-oauth', 'width=500,height=640');
    popupRef.current = popup;

    const handler = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      const data = event.data as { type?: string; token?: string; email?: string };
      if (data.type !== 'warmpulse:oauth') return;
      if (data.token) {
        onPatch({
          oauth_token: data.token,
          email_address: data.email ?? draft.email_address,
        });
        setState('done');
        window.removeEventListener('message', handler);
        cleanup();
      }
    };
    window.addEventListener('message', handler);

    // If popup immediately hits a 404 or can't open, we can't tell from the parent frame,
    // so we lean on a timeout — but surface a distinct "unavailable" state if the popup
    // never opened (e.g. blocker).
    if (!popup) {
      setState('unavailable');
      window.removeEventListener('message', handler);
      return;
    }

    timerRef.current = window.setTimeout(() => {
      window.removeEventListener('message', handler);
      setState('timeout');
      cleanup();
    }, OAUTH_TIMEOUT_MS);
  }, [provider, onPatch, draft.email_address, cleanup]);

  const providerLabel =
    provider === 'gmail' ? 'Google' : 'Microsoft';
  const done = state === 'done';

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-dim">
        {t('onb.cred.oauthDesc', { provider: providerLabel })}
      </p>

      <Card>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck
              className={cn('h-5 w-5', done ? 'text-accent' : 'text-text-dim')}
            />
            <div>
              <div className="text-sm font-semibold text-text">
                {done
                  ? t('onb.cred.connected', { provider: providerLabel })
                  : t('onb.cred.connect', { provider: providerLabel })}
              </div>
              <div className="text-xs text-text-dim">
                {done
                  ? (draft.email_address ?? t('onb.cred.tokenReceived'))
                  : t('onb.cred.securePopup')}
              </div>
            </div>
          </div>
          {done ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onPatch({ oauth_token: null });
                setState('idle');
              }}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              {t('onb.cred.reconnect')}
            </Button>
          ) : (
            <Button
              onClick={start}
              disabled={state === 'pending'}
              leftIcon={
                state === 'pending' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )
              }
            >
              {state === 'pending'
                ? t('onb.cred.waiting')
                : t('onb.cred.connect', { provider: providerLabel })}
            </Button>
          )}
        </CardContent>
      </Card>

      {state === 'timeout' ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p className="font-medium">{t('onb.cred.timeoutTitle')}</p>
          <p className="text-xs text-amber-200/80">
            {t('onb.cred.timeoutDesc')}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={start}>
              {t('onb.cred.tryAgain')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onBackToProvider}>
              {t('onb.cred.pickProvider')}
            </Button>
          </div>
        </div>
      ) : null}

      {state === 'unavailable' ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p className="font-medium">
            {t('onb.cred.unavailTitle', { provider: providerLabel })}
          </p>
          <p className="text-xs text-amber-200/80">
            {t('onb.cred.unavailDesc', { provider: providerLabel })}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={onBackToProvider}
          >
            {t('onb.cred.backToProvider')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------- SMTP/IMAP form ----------------

type ZohoRegion = 'com' | 'in' | 'eu' | 'com.au' | 'jp' | 'com.cn';

function defaultsFor(
  provider: 'yahoo' | 'zoho' | 'smtp' | 'gmail' | 'outlook',
  region?: ZohoRegion,
) {
  if (provider === 'yahoo') {
    return { smtp_host: 'smtp.mail.yahoo.com', imap_host: 'imap.mail.yahoo.com' };
  }
  if (provider === 'zoho') {
    const r = region ?? 'com';
    return { smtp_host: `smtp.zoho.${r}`, imap_host: `imap.zoho.${r}` };
  }
  if (provider === 'outlook') {
    return { smtp_host: 'smtp.office365.com', imap_host: 'outlook.office365.com' };
  }
  return { smtp_host: '', imap_host: '' };
}

function SmtpPanel({
  provider,
  draft,
  onPatch,
  onValidityChange,
}: {
  provider: 'yahoo' | 'zoho' | 'smtp' | 'gmail' | 'outlook';
  draft: OnboardingDraft;
  onPatch: (p: Partial<OnboardingDraft>) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const t = useT();
  const [showPwd, setShowPwd] = useState(false);
  const hostDefaults = defaultsFor(provider);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<SmtpFormValues>({
    resolver: zodResolver(smtpSchema),
    mode: 'onChange',
    defaultValues: {
      email_address: draft.email_address ?? '',
      smtp_host: draft.smtp_host ?? hostDefaults.smtp_host,
      smtp_port: draft.smtp_port ?? 587,
      smtp_username: draft.smtp_username ?? draft.email_address ?? '',
      smtp_password: draft.smtp_password ?? '',
      imap_host: draft.imap_host ?? hostDefaults.imap_host,
      imap_port: draft.imap_port ?? 993,
    },
  });

  const emailValue = watch('email_address');
  const usernameValue = watch('smtp_username');
  const [probeError, setProbeError] = useState<string | null>(null);
  const probe = useProbeCredentials();

  // If the user hasn't customised the SMTP username, mirror the email field into it.
  useEffect(() => {
    if (!usernameValue || usernameValue === draft.smtp_username) {
      if (emailValue && (!usernameValue || usernameValue === draft.smtp_username)) {
        setValue('smtp_username', emailValue, { shouldValidate: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailValue]);

  // Any keystroke after a successful probe invalidates the verification —
  // the user has to re-test. We DO NOT push live form values into the draft
  // anymore; the draft only gets populated after the probe returns 200.
  const values = watch();
  useEffect(() => {
    if (draft.credentials_verified) {
      onPatch({ credentials_verified: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    values.email_address,
    values.smtp_host,
    values.smtp_port,
    values.smtp_username,
    values.smtp_password,
    values.imap_host,
    values.imap_port,
  ]);

  useEffect(() => {
    onValidityChange(!!draft.credentials_verified);
  }, [draft.credentials_verified, onValidityChange]);

  const handleProbe = async () => {
    setProbeError(null);
    if (!isValid) return;
    try {
      await probe.mutateAsync({
        email_address: values.email_address,
        smtp_host: values.smtp_host,
        smtp_port: values.smtp_port,
        smtp_username: values.smtp_username,
        smtp_password: values.smtp_password,
        imap_host: values.imap_host || undefined,
        imap_port: values.imap_port || undefined,
      });
      onPatch({
        email_address: values.email_address ?? null,
        smtp_host: values.smtp_host ?? null,
        smtp_port: values.smtp_port ?? null,
        smtp_username: values.smtp_username ?? null,
        smtp_password: values.smtp_password ?? null,
        imap_host: values.imap_host ?? null,
        imap_port: values.imap_port ?? null,
        credentials_verified: true,
      });
    } catch (err) {
      const detail =
        err instanceof AxiosError
          ? typeof err.response?.data?.detail === 'string'
            ? err.response.data.detail
            : err.message
          : t('onb.cred.verifyFailed');
      setProbeError(detail);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(() => undefined)}>
      <FormField label={t('onb.cred.emailAddress')} htmlFor="email_address" error={errors.email_address?.message} required>
        <Input
          id="email_address"
          type="email"
          autoComplete="email"
          placeholder={t('onb.cred.emailPlaceholder')}
          {...register('email_address')}
          invalid={!!errors.email_address}
        />
      </FormField>

      <fieldset className="space-y-3 rounded-lg border border-border-muted p-4">
        <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-text-dim">
          {t('onb.cred.outgoing')}
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <FormField label={t('onb.cred.host')} htmlFor="smtp_host" error={errors.smtp_host?.message} required>
              <Input
                id="smtp_host"
                placeholder="smtp.gmail.com"
                {...register('smtp_host')}
                invalid={!!errors.smtp_host}
              />
            </FormField>
          </div>
          <FormField label={t('onb.cred.port')} htmlFor="smtp_port" error={errors.smtp_port?.message} required>
            <Input
              id="smtp_port"
              type="number"
              {...register('smtp_port', { valueAsNumber: true })}
              invalid={!!errors.smtp_port}
            />
          </FormField>
        </div>
        <FormField label={t('onb.cred.username')} htmlFor="smtp_username" error={errors.smtp_username?.message} required>
          <Input
            id="smtp_username"
            autoComplete="username"
            {...register('smtp_username')}
            invalid={!!errors.smtp_username}
          />
        </FormField>
        <FormField label={t('onb.cred.password')} htmlFor="smtp_password" error={errors.smtp_password?.message} required>
          <div className="relative">
            <Input
              id="smtp_password"
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-10"
              {...register('smtp_password')}
              invalid={!!errors.smtp_password}
            />
            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              aria-label={showPwd ? t('onb.cred.hidePassword') : t('onb.cred.showPassword')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-dim hover:text-text focus-ring"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FormField>
        <AppPasswordHelp
          provider={
            (provider === 'yahoo' || provider === 'outlook' || provider === 'zoho'
              ? provider
              : 'smtp') as AppPasswordProvider
          }
        />
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border-muted p-4">
        <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-text-dim">
          {t('onb.cred.incoming')} <span className="ml-1 font-normal normal-case text-text-dim/70">{t('onb.cred.incomingOptional')}</span>
        </legend>
        <p className="text-xs text-text-dim">
          {t('onb.cred.imapBlankNote')}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <FormField label={t('onb.cred.host')} htmlFor="imap_host" error={errors.imap_host?.message}>
              <Input
                id="imap_host"
                placeholder={t('onb.cred.imapHostPlaceholder')}
                {...register('imap_host')}
                invalid={!!errors.imap_host}
              />
            </FormField>
          </div>
          <FormField label={t('onb.cred.port')} htmlFor="imap_port" error={errors.imap_port?.message}>
            <Input
              id="imap_port"
              type="number"
              placeholder="993"
              {...register('imap_port', { valueAsNumber: true })}
              invalid={!!errors.imap_port}
            />
          </FormField>
        </div>
      </fieldset>

      <p className="text-xs text-text-dim">
        {t('onb.cred.encNote')}
      </p>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface p-3">
        <div className="flex items-center gap-2 text-sm">
          {draft.credentials_verified ? (
            <>
              <ShieldCheck className="h-4 w-4 text-accent" />
              <span className="font-medium text-accent">{t('onb.cred.verified')}</span>
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4 text-text-dim" />
              <span className="text-text-dim">
                {t('onb.cred.verifyDesc')}
              </span>
            </>
          )}
        </div>
        <Button
          type="button"
          onClick={handleProbe}
          disabled={!isValid || probe.isPending}
          leftIcon={probe.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        >
          {probe.isPending
            ? t('onb.cred.testing')
            : draft.credentials_verified
              ? t('onb.cred.retest')
              : t('onb.cred.test')}
        </Button>
      </div>

      {probeError ? (
        <div className="rounded-md border border-accent3/40 bg-accent3/10 px-3 py-2 text-xs text-accent3">
          {probeError}
        </div>
      ) : null}
    </form>
  );
}
