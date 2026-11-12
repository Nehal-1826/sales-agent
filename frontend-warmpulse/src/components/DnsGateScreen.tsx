import { Link } from 'react-router-dom';
import { ShieldAlert, CheckCircle2, XCircle, HelpCircle, ArrowRight, Inbox, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { Mailbox } from '@/features/mailboxes/types';

interface DnsGateScreenProps {
  mailbox: Mailbox | null;
}

interface RecordChipProps {
  label: string;
  state: boolean | null | undefined;
  description: string;
}

function RecordChip({ label, state, description }: RecordChipProps) {
  const isOk = state === true;
  const isFail = state === false;
  const Icon = isOk ? CheckCircle2 : isFail ? XCircle : HelpCircle;
  const tone = isOk
    ? 'border-accent/40 text-accent'
    : isFail
    ? 'border-accent3/50 text-accent3'
    : 'border-border-muted text-text-dim';
  const statusLabel = isOk ? 'Passing' : isFail ? 'Missing or invalid' : 'Not checked';
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-surface-2/60 p-4',
        tone,
      )}
    >
      <div className="flex items-center gap-2">
        <Icon size={18} strokeWidth={2} />
        <span className="text-sm font-semibold text-text">{label}</span>
      </div>
      <p className="text-xs text-text-dim leading-relaxed">{description}</p>
      <span className="text-[11px] uppercase tracking-wide font-medium">
        {statusLabel}
      </span>
    </div>
  );
}

interface StepProps {
  index: number;
  title: string;
  body: string;
}

function Step({ index, title, body }: StepProps) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-xs font-semibold text-accent">
        {index}
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-sm font-semibold text-text">{title}</div>
        <div className="text-sm text-text-dim leading-relaxed">{body}</div>
      </div>
    </div>
  );
}

/**
 * Full-bleed locked screen shown to users whose primary mailbox has
 * failing DNS records. Lives inside ClientLayout so the sidebar stays
 * visible — only the page content is replaced. Routes users to
 * /app/mailboxes (the one place where they can re-run the DNS check)
 * and falls back to /app/settings for account management.
 */
export function DnsGateScreen({ mailbox }: DnsGateScreenProps) {
  const domain = mailbox?.email_address?.split('@')[1] ?? 'your domain';
  const email = mailbox?.email_address ?? null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      {/* Gradient header */}
      <div className="relative overflow-hidden rounded-2xl border border-border-muted bg-gradient-to-br from-accent3/20 via-surface to-accent/10 p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent3/40 bg-accent3/10 text-accent3">
            <ShieldAlert size={24} strokeWidth={2} />
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-text">
              Add your domain records (DNS) before warming up
            </h1>
            <p className="text-sm text-text-dim leading-relaxed max-w-2xl">
              We can't safely warm up{' '}
              {email ? (
                <span className="font-medium text-text">{email}</span>
              ) : (
                'your mailbox'
              )}{' '}
              until <span className="font-medium text-text">{domain}</span>{' '}
              publishes valid SPF, DKIM and DMARC records. Without them,
              mailbox providers will route your mail to spam — undoing the
              warmup work.
            </p>
          </div>
        </div>
      </div>

      {/* Failing records */}
      <Card variant="solid">
        <CardContent className="flex flex-col gap-4">
          <div className="text-sm font-semibold text-text">
            Current domain records (DNS) status for {domain}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <RecordChip
              label="SPF"
              state={mailbox?.spf_valid ?? null}
              description="Declares who is allowed to send mail for you."
            />
            <RecordChip
              label="DKIM"
              state={mailbox?.dkim_valid ?? null}
              description="A tamper-proof signature on every message you send."
            />
            <RecordChip
              label="DMARC"
              state={mailbox?.dmarc_valid ?? null}
              description="Tells receivers what to do when SPF or DKIM fail."
            />
          </div>
        </CardContent>
      </Card>

      {/* Steps */}
      <Card variant="solid">
        <CardContent className="flex flex-col gap-5">
          <div className="text-sm font-semibold text-text">
            How to unlock your account
          </div>
          <div className="flex flex-col gap-4">
            <Step
              index={1}
              title="Publish the missing SPF / DKIM / DMARC records"
              body={`Add the records on ${domain} via your DNS provider (Cloudflare, GoDaddy, Route53, etc.). The Mailboxes page shows the exact values to paste.`}
            />
            <Step
              index={2}
              title="Wait 5-15 minutes for DNS propagation"
              body="DNS changes are not instant. Most providers propagate within a few minutes; some take up to an hour."
            />
            <Step
              index={3}
              title="Come back, open Mailboxes, and click Re-check"
              body="Once all three records pass, the rest of WarmPulse unlocks automatically and warmup resumes."
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="primary" size="lg">
          <Link to="/app/mailboxes">
            <Inbox size={16} strokeWidth={2} className="mr-2" />
            Open Mailboxes
            <ArrowRight size={16} strokeWidth={2} className="ml-2" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link to="/app/settings">
            <Settings size={16} strokeWidth={2} className="mr-2" />
            View account settings
          </Link>
        </Button>
      </div>
    </div>
  );
}
