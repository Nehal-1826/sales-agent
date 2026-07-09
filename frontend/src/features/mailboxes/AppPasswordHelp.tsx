/**
 * Inline disclosure rendered under the SMTP password field in the
 * mailbox-connect dialogs. Shows provider-specific step-by-step instructions
 * for generating an app password.
 *
 * We deliberately use a native ``<details>`` element instead of pulling in
 * Radix's Accordion — the row sits inside an already-tall form and a single
 * collapsible doesn't justify the JS / a11y machinery.
 *
 * Tailwind tokens only (``bg-surface-2``, ``text-text-dim``, ``border-border-muted``,
 * ``text-accent``) — see ``tailwind.config.ts``.
 */
import { ExternalLink, HelpCircle } from 'lucide-react';

export type AppPasswordProvider = 'gmail' | 'yahoo' | 'outlook' | 'zoho' | 'smtp';

interface ProviderInstructions {
  label: string;
  // Each step is rendered as an <li> — the URL (if any) becomes a link inline.
  steps: Array<{ text: string; url?: string; linkLabel?: string }>;
  footer?: string;
}

const INSTRUCTIONS: Record<AppPasswordProvider, ProviderInstructions> = {
  gmail: {
    label: 'Gmail / Google Workspace',
    steps: [
      {
        text: 'Open your Google Account security page.',
        url: 'https://myaccount.google.com/security',
        linkLabel: 'myaccount.google.com/security',
      },
      { text: 'Enable 2-Step Verification if it is not already on (required for app passwords).' },
      {
        text: 'Open the App passwords page.',
        url: 'https://myaccount.google.com/apppasswords',
        linkLabel: 'myaccount.google.com/apppasswords',
      },
      { text: 'Create a new app password and name it "WarmPulse" (or anything memorable).' },
      { text: 'Copy the 16-character password Google shows you and paste it into the field above.' },
    ],
    footer:
      'Google displays the password as four space-separated groups — paste either with or without spaces; WarmPulse normalizes both.',
  },
  yahoo: {
    label: 'Yahoo Mail',
    steps: [
      {
        text: 'Sign in to your Yahoo Account security page.',
        url: 'https://login.yahoo.com/account/security',
        linkLabel: 'login.yahoo.com/account/security',
      },
      { text: 'Turn on 2-Step Verification if it is off — app passwords require it.' },
      { text: 'Click "Generate app password" and pick "Other app".' },
      { text: 'Name it "WarmPulse" and click Generate.' },
      { text: 'Copy the 16-character password Yahoo displays and paste it above.' },
    ],
  },
  outlook: {
    label: 'Outlook / Microsoft 365',
    steps: [
      {
        text: 'Sign in to your Microsoft account security page.',
        url: 'https://account.microsoft.com/security',
        linkLabel: 'account.microsoft.com/security',
      },
      { text: 'Open "Advanced security options".' },
      { text: 'Make sure two-step verification is enabled.' },
      {
        text: 'Scroll to "App passwords" and create a new one.',
        url: 'https://account.live.com/proofs/AppPassword',
        linkLabel: 'account.live.com/proofs/AppPassword',
      },
      { text: 'Copy the generated password and paste it above.' },
    ],
    footer:
      'Work / school Microsoft 365 tenants may have legacy SMTP AUTH disabled — if the probe fails, ask your admin to enable "Authenticated SMTP" or use the OAuth tile instead.',
  },
  zoho: {
    label: 'Zoho Mail',
    steps: [
      {
        text: 'Open the Zoho App Passwords screen.',
        url: 'https://accounts.zoho.com/home#security/app_passwords',
        linkLabel: 'accounts.zoho.com → Security → App Passwords',
      },
      { text: 'Click "Generate New Password" and name it WarmPulse.' },
      { text: 'Copy the password Zoho displays and paste it above.' },
    ],
  },
  smtp: {
    label: 'Generic SMTP / IMAP',
    steps: [
      {
        text: 'Find your provider\'s SMTP host and port (typical: STARTTLS on 587, implicit TLS on 465).',
      },
      {
        text:
          'If your provider supports 2FA, generate an app-specific password — your normal login password will be rejected once 2FA is enabled.',
      },
      {
        text:
          'IMAP is optional but recommended: the inbound port is usually 993 on the same host (or sometimes "imap.<your-host>").',
      },
    ],
    footer:
      'Hostinger / cPanel / iRedMail self-hosted: use the same host for SMTP and IMAP; ports 587 + 993; the mailbox\'s own login password works unless you specifically enabled 2FA.',
  },
};

interface AppPasswordHelpProps {
  provider: AppPasswordProvider;
  className?: string;
}

export function AppPasswordHelp({ provider, className }: AppPasswordHelpProps) {
  const info = INSTRUCTIONS[provider];
  if (!info) return null;

  return (
    <details
      className={[
        'group rounded-lg border border-border-muted bg-surface-2/40 text-xs text-text-dim',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium text-text hover:text-accent">
        <HelpCircle className="h-3.5 w-3.5 text-accent" />
        How do I get an app password for {info.label}?
        <span className="ml-auto text-[10px] text-text-dim group-open:hidden">show</span>
        <span className="ml-auto hidden text-[10px] text-text-dim group-open:inline">hide</span>
      </summary>
      <div className="border-t border-border-muted/60 px-3 py-3">
        <ol className="ml-4 list-decimal space-y-1.5 text-text">
          {info.steps.map((s, idx) => (
            <li key={idx}>
              <span className="text-text-dim">{s.text}</span>
              {s.url ? (
                <>
                  {' '}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-accent hover:underline"
                  >
                    {s.linkLabel ?? s.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ol>
        {info.footer ? (
          <p className="mt-2 border-t border-border-muted/40 pt-2 text-[11px] text-text-dim">
            {info.footer}
          </p>
        ) : null}
      </div>
    </details>
  );
}
