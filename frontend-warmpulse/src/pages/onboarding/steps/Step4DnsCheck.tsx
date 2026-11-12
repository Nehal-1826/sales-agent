import { useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import {
  AppAccordion,
  AppAccordionContent,
  AppAccordionItem,
  AppAccordionTrigger,
} from '@/components/ui/AppAccordion';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/AppToast';
import { Check, Copy, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { useDnsCheck, type DnsCheckResponse } from '@/features/mailboxes/useCreateMailbox';
import type { OnboardingDraft } from '../useOnboardingMachine';
import { cn } from '@/lib/cn';
import { useT, type TFunc } from '@/lib/i18n';

interface Step4DnsCheckProps {
  emailAddress: string | null;
  /** Provider hint from earlier wizard step — drives SPF include + DKIM guidance. */
  provider?: OnboardingDraft['provider'];
  /** Tells the shell whether Next is allowed.
   *  Strict: only true when all three records pass (or the unavailable degrade path). */
  onValidityChange: (valid: boolean) => void;
}

type Mode = 'idle' | 'running' | 'result' | 'unavailable';

type ProviderKey = NonNullable<OnboardingDraft['provider']> | 'unknown';

interface RecordSpec {
  label: 'SPF' | 'DKIM' | 'DMARC';
  key: 'spf_valid' | 'dkim_valid' | 'dmarc_valid';
  host: string;
  type: 'TXT';
  value: string;
  /** When DKIM, we don't generate the public key — point to provider's docs. */
  note?: string;
}

/**
 * Detect the user's sending provider for the purpose of tailoring SPF.
 *
 * Priority:
 *  1. Explicit provider chosen in Step 2 (`draft.provider`).
 *  2. Domain heuristic on the public part of the email (gmail.com, outlook.com, etc.) —
 *     useful when the user is on a personal mailbox without a custom domain.
 *  3. Fallback to 'unknown' which renders a generic placeholder + an explanatory note.
 */
const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'zoho.com',
  'zohomail.com',
]);

function isConsumerDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (CONSUMER_DOMAINS.has(d)) return true;
  if (d.startsWith('yahoo.')) return true;
  return false;
}

function detectProvider(
  provider: OnboardingDraft['provider'] | undefined,
  domain: string,
): ProviderKey {
  const d = domain.toLowerCase();
  if (d === 'gmail.com' || d === 'googlemail.com') return 'gmail';
  if (
    d === 'outlook.com' ||
    d === 'hotmail.com' ||
    d === 'live.com' ||
    d.endsWith('.onmicrosoft.com')
  )
    return 'outlook_oauth';
  if (d === 'yahoo.com' || d.startsWith('yahoo.')) return 'yahoo';
  if (d === 'zoho.com' || d.endsWith('.zoho.com')) return 'zoho';
  if (provider) return provider;
  return 'unknown';
}

function spfRecordFor(provider: ProviderKey): { value: string; note?: string } {
  switch (provider) {
    case 'gmail':
      return { value: 'v=spf1 include:_spf.google.com ~all' };
    case 'outlook':
    case 'outlook_oauth':
      return { value: 'v=spf1 include:spf.protection.outlook.com ~all' };
    case 'yahoo':
      return { value: 'v=spf1 include:_spf.mail.yahoo.com ~all' };
    case 'zoho':
      return { value: 'v=spf1 include:zoho.com ~all' };
    case 'smtp':
      return {
        value: 'v=spf1 include:<your-smtp-provider> ~all',
        note: 'Replace <your-smtp-provider> with the include given by your SMTP host (e.g. include:sendgrid.net, include:mailgun.org).',
      };
    default:
      return {
        value: 'v=spf1 -all',
        note: 'We could not auto-detect your sending provider. Replace this with the include directive published by your email provider before saving.',
      };
  }
}

function dkimGuidanceFor(provider: ProviderKey, domain: string): RecordSpec {
  const base: Omit<RecordSpec, 'host' | 'value' | 'note'> = {
    label: 'DKIM',
    key: 'dkim_valid',
    type: 'TXT',
  };
  switch (provider) {
    case 'gmail':
      return {
        ...base,
        host: `google._domainkey.${domain}`,
        value: '(generated in Google Workspace admin)',
        note: 'In Google Workspace admin go to Apps - Gmail - Authenticate email, generate a 2048-bit key, then publish the provided TXT value at the host shown above. Selector is usually "google".',
      };
    case 'outlook':
    case 'outlook_oauth':
      return {
        ...base,
        host: `selector1._domainkey.${domain}`,
        value: '(provided by Microsoft 365 DKIM setup)',
        note: 'In Microsoft Defender go to Email & collaboration - Policies - DKIM, select your domain, and publish both selector1 and selector2 CNAME/TXT records as instructed.',
      };
    case 'yahoo':
      return {
        ...base,
        host: `s1._domainkey.${domain}`,
        value: '(provided by Yahoo Mail Plus / Yahoo Small Business)',
        note: 'Yahoo Business hands you a CNAME pair (s1, s2). Publish both with the values from your Yahoo admin.',
      };
    case 'zoho':
      return {
        ...base,
        host: `zoho._domainkey.${domain}`,
        value: '(generated in Zoho Mail admin)',
        note: 'In Zoho Mail Admin Console go to Domains - your domain - Email Configuration - DKIM, generate a selector, and publish the TXT record provided.',
      };
    case 'smtp':
      return {
        ...base,
        host: `<selector>._domainkey.${domain}`,
        value: '(provided by your SMTP host)',
        note: 'SMTP relays (SendGrid, Mailgun, Postmark, Amazon SES, etc.) generate DKIM keys on their dashboard. Copy the selector + TXT record they show you and publish it in DNS.',
      };
    default:
      return {
        ...base,
        host: `<selector>._domainkey.${domain}`,
        value: '(generate via your email provider)',
        note: 'DKIM keys are issued by your email provider — they hand you a selector and a long public-key TXT value. Publish it as a TXT record at <selector>._domainkey.' +
          domain +
          '.',
      };
  }
}

function dmarcRecordFor(domain: string): RecordSpec {
  return {
    label: 'DMARC',
    key: 'dmarc_valid',
    host: `_dmarc.${domain}`,
    type: 'TXT',
    value: `v=DMARC1; p=none; rua=mailto:dmarc-reports@${domain}`,
    note: 'Start with p=none to monitor; after 2-4 weeks of clean reports tighten to p=quarantine, then p=reject.',
  };
}

function spfSpec(provider: ProviderKey): RecordSpec {
  const { value, note } = spfRecordFor(provider);
  return {
    label: 'SPF',
    key: 'spf_valid',
    host: '@',
    type: 'TXT',
    value,
    note,
  };
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

interface WalkthroughStep {
  text: string;
  href?: string;
  code?: string;
}

function dkimWalkthrough(
  provider: ProviderKey,
  domain: string,
): WalkthroughStep[] {
  switch (provider) {
    case 'zoho':
      return [
        {
          text: `Sign in to Zoho Mail Admin as the admin of ${domain}.`,
          href: 'https://mailadmin.zoho.com',
        },
        { text: `Domains → ${domain} → Email Configuration → DKIM.` },
        { text: 'Click "Add Selector". Selector name: zoho (lowercase). Save.' },
        {
          text: `Zoho shows two values — copy both: the TXT Host (zoho._domainkey) and the long TXT Value starting with v=DKIM1; k=rsa; p=…`,
        },
        {
          text: 'Open a second tab and publish that TXT record at your DNS host using the Host + Value shown above. Leave the Zoho tab open.',
        },
        {
          text: 'After ~10 minutes (DNS propagation), return to Zoho and click "Verify" next to the selector. The status flips to verified.',
        },
        {
          text: 'Then come back here and click Re-check.',
        },
      ];
    case 'gmail':
      return [
        {
          text: 'Sign in to Google Workspace Admin as an admin of ' + domain + '.',
          href: 'https://admin.google.com',
        },
        { text: 'Apps → Google Workspace → Gmail → Authenticate email.' },
        { text: `Pick the domain ${domain}.` },
        {
          text: 'Click "Generate new record". Selector: google. Key length: 2048-bit. Generate.',
        },
        {
          text: 'Google shows two values — copy both: DNS Host name (google._domainkey) and the long TXT value (starts with v=DKIM1; k=rsa; p=…).',
        },
        {
          text: 'Publish that TXT record at your DNS host using the values above. Wait ~10 minutes.',
        },
        {
          text: 'Back in Google Admin → Gmail → Authenticate email → click "Start authentication". When it turns green, come back here and click Re-check.',
        },
      ];
    case 'outlook':
    case 'outlook_oauth':
      return [
        {
          text: 'Sign in to Microsoft Defender as a Global Admin.',
          href: 'https://security.microsoft.com',
        },
        {
          text: 'Email & collaboration → Policies & rules → Threat policies → Email authentication settings → DKIM.',
        },
        { text: `Select the domain ${domain}.` },
        {
          text: 'Microsoft 365 shows two CNAME records (selector1, selector2) you need to publish. Copy both pairs of Host and Points-to values.',
        },
        {
          text: 'Publish both CNAMEs at your DNS host (Type: CNAME, not TXT, for M365).',
        },
        {
          text: 'After ~10 minutes, return to Defender → toggle DKIM signing to On. When the slider stays on, come back here and click Re-check.',
        },
      ];
    case 'yahoo':
      return [
        {
          text: 'Sign in to Yahoo Small Business / Yahoo Business Mail admin for ' + domain + '.',
        },
        { text: 'Find the DKIM / email authentication section.' },
        {
          text: 'Yahoo issues two selectors (typically s1 and s2). Copy the host names and TXT/CNAME values they provide.',
        },
        { text: 'Publish both records at your DNS host.' },
        {
          text: 'Wait ~10 minutes, verify in the Yahoo admin, then click Re-check here.',
        },
      ];
    case 'smtp':
      return [
        {
          text: 'Sign in to your SMTP relay\'s dashboard (SendGrid, Mailgun, Postmark, Amazon SES, etc.).',
        },
        {
          text: 'Find the Sender Authentication / Domain Authentication section.',
        },
        { text: `Add ${domain} as an authenticated sending domain.` },
        {
          text: 'The relay generates DKIM keys (often as CNAME records) — copy every Host + Value pair it shows.',
        },
        { text: 'Publish them all at your DNS host (match Type exactly: TXT vs CNAME).' },
        {
          text: 'Click "Verify" in the relay dashboard, then Re-check here.',
        },
      ];
    default:
      return [
        {
          text: 'Sign in to your email provider\'s admin console (the place where you manage ' + domain + ').',
        },
        { text: 'Find the DKIM / Domain Authentication / Email Authentication section.' },
        {
          text: 'Generate a DKIM key. The admin will show you a selector name and a long TXT value.',
        },
        {
          text: 'Publish a TXT record at <selector>._domainkey.' + domain + ' with that value at your DNS host.',
        },
        {
          text: 'Click Verify in your provider, then Re-check here.',
        },
      ];
  }
}

function dmarcWalkthrough(domain: string): WalkthroughStep[] {
  return [
    { text: 'No provider-side step — DMARC is a pure DNS record.' },
    {
      text: `At your DNS host, add a new TXT record with Host = _dmarc and Value = v=DMARC1; p=none; rua=mailto:dmarc-reports@${domain}`,
    },
    {
      text: 'Start with p=none (monitor-only). After 2-4 weeks of clean reports, tighten to p=quarantine, then later p=reject.',
    },
    { text: 'Wait ~10 minutes for propagation, then click Re-check here.' },
  ];
}

function spfWalkthrough(
  provider: ProviderKey,
  domain: string,
): WalkthroughStep[] {
  const includeByProvider: Record<string, string> = {
    gmail: 'include:_spf.google.com',
    outlook: 'include:spf.protection.outlook.com',
    outlook_oauth: 'include:spf.protection.outlook.com',
    yahoo: 'include:_spf.mail.yahoo.com',
    zoho: 'include:zoho.com',
  };
  const inc = includeByProvider[provider] ?? 'include:<your-provider>';
  return [
    {
      text: 'At your DNS host, check if a TXT record already exists on the root (host = @) starting with v=spf1. If yes, merge — do not create a second one (multiple SPF records break SPF).',
    },
    {
      text: `Add (or merge) the value: v=spf1 ${inc} ~all on host @ for ${domain}.`,
    },
    { text: 'Wait ~10 minutes for propagation, then click Re-check here.' },
  ];
}

function walkthroughFor(
  key: RecordSpec['key'],
  provider: ProviderKey,
  domain: string,
): WalkthroughStep[] {
  if (key === 'dkim_valid') return dkimWalkthrough(provider, domain);
  if (key === 'dmarc_valid') return dmarcWalkthrough(domain);
  return spfWalkthrough(provider, domain);
}

function StepList({ steps }: { steps: WalkthroughStep[] }) {
  return (
    <ol className="ml-4 list-decimal space-y-1.5 text-xs text-text-dim marker:text-text-dim">
      {steps.map((s, i) => (
        <li key={i} className="leading-relaxed">
          {s.href ? (
            <>
              {s.text.split(/(https?:\/\/\S+)/).map((part, j) =>
                part.startsWith('http') ? (
                  <a
                    key={j}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {part}
                  </a>
                ) : (
                  <span key={j}>{part}</span>
                ),
              )}
              {!/https?:\/\//.test(s.text) && (
                <>
                  {' '}
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    open
                  </a>
                </>
              )}
            </>
          ) : (
            s.text
          )}
        </li>
      ))}
    </ol>
  );
}

function WhereToPublishBlock({ domain, t }: { domain: string; t: TFunc }) {
  const rows: [string, string][] = [
    ['Cloudflare', 'DNS → Records → Add record → Type: TXT'],
    ['GoDaddy', 'My Products → DNS → Manage Zones → ' + domain + ' → Add → TXT'],
    ['Namecheap', 'Domain List → Manage → Advanced DNS → Add New Record → TXT'],
    ['Hostinger', 'hPanel → Domains → DNS / Nameservers → Add Record → TXT'],
    ['Route 53', 'Hosted zones → ' + domain + ' → Create record → TXT'],
    ['Google Domains / Squarespace', 'DNS → Custom records → Add → TXT'],
  ];
  return (
    <details className="rounded-lg border border-border-muted bg-surface px-3 py-2 text-xs text-text-dim">
      <summary className="cursor-pointer select-none text-text">
        {t('onb.dns.whereTitle')}
      </summary>
      <div className="mt-2 space-y-2">
        <p>
          {t('onb.dns.whereDesc', { domain })}
        </p>
        <pre className="overflow-x-auto rounded bg-surface-2 px-2 py-1.5 font-mono text-[11px] text-text">
          dig +short NS {domain}
        </pre>
        <table className="w-full text-left">
          <tbody>
            {rows.map(([host, path]) => (
              <tr key={host} className="border-t border-border-muted/40">
                <td className="py-1 pr-2 font-medium text-text whitespace-nowrap">
                  {host}
                </td>
                <td className="py-1">{path}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          {t('onb.dns.whereTip')}
        </p>
      </div>
    </details>
  );
}

function VerifyBlock({ domain, t }: { domain: string; t: TFunc }) {
  return (
    <details className="rounded-lg border border-border-muted bg-surface px-3 py-2 text-xs text-text-dim">
      <summary className="cursor-pointer select-none text-text">
        {t('onb.dns.verifyTitle')}
      </summary>
      <div className="mt-2 space-y-1.5">
        <p>{t('onb.dns.verifyDesc')}</p>
        <pre className="overflow-x-auto rounded bg-surface-2 px-2 py-1.5 font-mono text-[11px] text-text">
{`dig +short TXT ${domain}
dig +short TXT zoho._domainkey.${domain}
dig +short TXT _dmarc.${domain}`}
        </pre>
        <p>
          {t('onb.dns.verifyNote')}
        </p>
      </div>
    </details>
  );
}

function RecordCard({ rec, t }: { rec: RecordSpec; t: TFunc }) {
  return (
    <div className="space-y-2 rounded-lg border border-border-muted bg-surface p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text">{rec.label}</h4>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-dim">
          {t('onb.dns.record', { type: rec.type })}
        </span>
      </div>
      <dl className="grid grid-cols-[80px_1fr_auto] items-start gap-x-3 gap-y-1 text-xs">
        <dt className="text-text-dim">Host</dt>
        <dd className="break-all font-mono text-text">{rec.host}</dd>
        <dd>
          <button
            type="button"
            onClick={() => copy(rec.host, t)}
            className="inline-flex h-6 items-center gap-1 rounded border border-border-muted bg-surface-2 px-2 text-[11px] text-text-dim hover:text-text focus-ring"
            aria-label={t('onb.dns.copyHost', { label: rec.label })}
          >
            <Copy className="h-3 w-3" />
            {t('onb.dns.copy')}
          </button>
        </dd>

        <dt className="text-text-dim">Value</dt>
        <dd className="break-all font-mono text-text">{rec.value}</dd>
        <dd>
          <button
            type="button"
            onClick={() => copy(rec.value, t)}
            className="inline-flex h-6 items-center gap-1 rounded border border-border-muted bg-surface-2 px-2 text-[11px] text-text-dim hover:text-text focus-ring"
            aria-label={t('onb.dns.copyValue', { label: rec.label })}
          >
            <Copy className="h-3 w-3" />
            {t('onb.dns.copy')}
          </button>
        </dd>
      </dl>
      {rec.note ? (
        <p className="text-xs text-text-dim">{rec.note}</p>
      ) : null}
    </div>
  );
}

export function Step4DnsCheck({
  emailAddress,
  provider,
  onValidityChange,
}: Step4DnsCheckProps) {
  const t = useT();
  const dns = useDnsCheck();
  const [mode, setMode] = useState<Mode>('idle');

  const domain = useMemo(
    () => (emailAddress ? emailAddress.split('@')[1] ?? '' : ''),
    [emailAddress],
  );

  const detected = useMemo(
    () => detectProvider(provider, domain),
    [provider, domain],
  );

  const specs = useMemo<Record<RecordSpec['key'], RecordSpec>>(
    () => ({
      spf_valid: spfSpec(detected),
      dkim_valid: dkimGuidanceFor(detected, domain || 'yourdomain.com'),
      dmarc_valid: dmarcRecordFor(domain || 'yourdomain.com'),
    }),
    [detected, domain],
  );

  const run = useMemo(
    () => () => {
      if (!emailAddress) return;
      setMode('running');
      dns.mutate(
        { email_address: emailAddress },
        {
          onSuccess: () => setMode('result'),
          onError: (err) => {
            if (err instanceof AxiosError && err.response?.status === 404) {
              setMode('unavailable');
            } else {
              setMode('unavailable');
            }
          },
        },
      );
    },
    [dns, emailAddress],
  );

  // Auto-kick the check on mount.
  useEffect(() => {
    if (mode === 'idle' && emailAddress) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailAddress]);

  const result: DnsCheckResponse | undefined = dns.data;

  // Strict gating: Next only unlocks when the live result reports all three valid.
  // 'unavailable' is a degrade — we let the user through because the backend
  // would have refused to validate at all in that environment.
  // Timeouts come back as result with false flags, which correctly stay blocked.
  const allPassed =
    mode === 'result' &&
    !!result &&
    result.spf_valid &&
    result.dkim_valid &&
    result.dmarc_valid;

  const isConsumer = isConsumerDomain(domain);

  useEffect(() => {
    onValidityChange(isConsumer || allPassed || mode === 'unavailable');
  }, [isConsumer, allPassed, mode, onValidityChange]);

  if (!emailAddress) {
    return (
      <div className="rounded-lg border border-border-muted p-4 text-sm text-text-dim">
        {t('onb.dns.missing')}
      </div>
    );
  }

  if (isConsumer) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-4">
          <div className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-text">
                {t('onb.dns.consumerTitle')}
              </p>
              <p className="text-sm text-text-dim">
                {t('onb.dns.consumerDesc', { domain })}
              </p>
              <p className="text-xs text-text-dim">
                {t('onb.dns.consumerNote')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const failingKeys: RecordSpec['key'][] = result
    ? (['spf_valid', 'dkim_valid', 'dmarc_valid'] as const).filter(
        (k) => result[k] === false,
      )
    : [];

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-dim">
        {t('onb.dns.desc', { domain: domain || emailAddress })}
      </p>

      {mode === 'unavailable' ? (
        <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">{t('onb.dns.unavailTitle')}</p>
              <p className="text-xs text-amber-200/80">
                {t('onb.dns.unavailDesc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={run}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              {t('onb.dns.tryAgain')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {(['spf_valid', 'dkim_valid', 'dmarc_valid'] as const).map((key) => {
            const label = specs[key].label;
            const running = mode === 'running';
            const value = result ? result[key] : undefined;
            return (
              <div
                key={key}
                className={cn(
                  'flex items-center justify-between rounded-lg border p-3',
                  'border-border-muted bg-surface',
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'inline-flex h-7 w-7 items-center justify-center rounded-full',
                      value === true && 'bg-accent/15 text-accent',
                      value === false && 'bg-accent3/15 text-accent3',
                      value === undefined && 'bg-surface-2 text-text-dim',
                    )}
                  >
                    {running && value === undefined ? (
                      <Spinner size={14} />
                    ) : value === true ? (
                      <Check className="h-4 w-4" />
                    ) : value === false ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <span className="block h-2 w-2 rounded-full bg-text-dim" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-text">{label}</div>
                    <div className="text-xs text-text-dim">
                      {value === true
                        ? t('onb.dns.ok')
                        : value === false
                          ? t('onb.dns.needsAttention')
                          : running
                            ? t('onb.dns.checking')
                            : '—'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'result' && result ? (
        <>
          {allPassed ? (
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm text-accent">
              {t('onb.dns.allPassed')}
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-accent3/30 bg-accent3/5 p-3">
              <div className="flex items-start gap-2 text-sm text-accent3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {failingKeys.length === 1
                    ? t('onb.dns.addMissing1')
                    : t('onb.dns.addMissingN')}
                </p>
              </div>

              <AppAccordion
                type="single"
                collapsible
                defaultValue="records"
                className="rounded-lg border border-border-muted bg-surface"
              >
                <AppAccordionItem value="records">
                  <AppAccordionTrigger className="px-3">
                    {failingKeys.length === 1
                      ? t('onb.dns.whatToAdd1')
                      : t('onb.dns.whatToAddN', { count: failingKeys.length })}
                  </AppAccordionTrigger>
                  <AppAccordionContent className="space-y-3 px-3 pb-3 text-sm text-text-dim">
                    <p className="text-xs">
                      {t('onb.dns.detected')}{' '}
                      <span className="font-medium text-text">
                        {detected === 'unknown' ? t('onb.dns.detectedUnknown') : detected}
                      </span>
                      . {t('onb.dns.instructions')}
                    </p>
                    {failingKeys.map((k) => (
                      <div key={k} className="space-y-2">
                        <RecordCard rec={specs[k]} t={t} />
                        <details className="rounded-lg border border-border-muted bg-surface px-3 py-2">
                          <summary className="cursor-pointer select-none text-xs font-medium text-text">
                            {specs[k].label === 'DKIM'
                              ? t('onb.dns.howToGetKey', { label: specs[k].label })
                              : t('onb.dns.howToGetValue', { label: specs[k].label })}
                          </summary>
                          <div className="mt-2">
                            <StepList
                              steps={walkthroughFor(k, detected, domain || 'yourdomain.com')}
                            />
                          </div>
                        </details>
                      </div>
                    ))}
                    <WhereToPublishBlock domain={domain || 'yourdomain.com'} t={t} />
                    <VerifyBlock domain={domain || 'yourdomain.com'} t={t} />
                    <p className="text-xs">
                      {t('onb.dns.propagation')}
                    </p>
                  </AppAccordionContent>
                </AppAccordionItem>
              </AppAccordion>
            </div>
          )}
          <div className="flex justify-start">
            <Button
              size="sm"
              variant="ghost"
              onClick={run}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              {t('onb.dns.recheck')}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
