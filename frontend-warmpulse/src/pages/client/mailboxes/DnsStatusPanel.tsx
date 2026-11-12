import { useState } from 'react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/AppToast';
import { useDnsCheck } from '@/features/mailboxes/api';
import type { DnsCheckResult, Mailbox } from '@/features/mailboxes/types';
import { cn } from '@/lib/cn';

interface DnsStatusPanelProps {
  mailbox: Mailbox;
}

const ROWS: Array<{
  key: 'spf' | 'dkim' | 'dmarc';
  label: string;
  hint: string;
}> = [
  { key: 'spf', label: 'SPF', hint: 'Authorizes which servers can send on your behalf.' },
  { key: 'dkim', label: 'DKIM', hint: 'Cryptographically signs each message.' },
  { key: 'dmarc', label: 'DMARC', hint: 'Tells receivers how to handle failures.' },
];

function DnsRow({
  label,
  hint,
  value,
}: {
  label: string;
  hint: string;
  value: boolean | null | undefined;
}) {
  const known = value === true || value === false;
  const ok = value === true;
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3',
        ok
          ? 'border-accent/30 bg-accent/5'
          : value === false
          ? 'border-accent3/30 bg-accent3/5'
          : 'border-border-muted bg-surface-2/30',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-bg',
          ok ? 'bg-accent' : value === false ? 'bg-accent3' : 'bg-text-dim/40',
        )}
      >
        {ok ? <Check className="h-3.5 w-3.5" /> : value === false ? <X className="h-3.5 w-3.5" /> : '?'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-text-dim">{hint}</p>
      </div>
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-[11px] font-medium',
          ok
            ? 'bg-accent/10 text-accent'
            : value === false
            ? 'bg-accent3/10 text-accent3'
            : 'bg-surface-2 text-text-dim',
        )}
      >
        {!known ? 'Unknown' : ok ? 'Valid' : 'Failing'}
      </span>
    </div>
  );
}

export function DnsStatusPanel({ mailbox }: DnsStatusPanelProps) {
  const dns = useDnsCheck();
  const [latest, setLatest] = useState<DnsCheckResult | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const values = {
    spf: latest?.spf_valid ?? mailbox.spf_valid,
    dkim: latest?.dkim_valid ?? mailbox.dkim_valid,
    dmarc: latest?.dmarc_valid ?? mailbox.dmarc_valid,
  };

  const recheck = () => {
    setUnavailable(false);
    dns.mutate(mailbox.id, {
      onSuccess: (data) => {
        if (!data) {
          setUnavailable(true);
          return;
        }
        setLatest(data);
        toast.success('DNS re-checked');
      },
      onError: () => toast.error('DNS check failed'),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-dim">
          Your domain records (DNS) decide inbox delivery. Re-check after updating records at your DNS provider.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={recheck}
          disabled={dns.isPending}
          leftIcon={
            dns.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )
          }
        >
          {dns.isPending ? 'Checking…' : 'Re-check'}
        </Button>
      </div>
      <div className="space-y-2">
        {ROWS.map((r) => (
          <DnsRow key={r.key} label={r.label} hint={r.hint} value={values[r.key]} />
        ))}
      </div>
      {unavailable ? (
        <p className="text-xs text-text-dim">
          DNS check not available yet — the backend endpoint is still rolling out.
        </p>
      ) : null}
      {latest?.fixes && latest.fixes.length > 0 ? (
        <div className="rounded-lg border border-border-muted bg-surface-2/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-dim">
            Suggested fixes
          </p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {latest.fixes.map((fix, i) => (
              <li key={i}>
                <span className="font-mono uppercase text-accent4">{fix.record}</span>{' '}
                <span className="text-text-dim">— {fix.instructions}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
