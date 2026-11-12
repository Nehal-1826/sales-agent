import { useMemo, useState } from 'react';
import { ShieldAlert, ShieldCheck, ShieldQuestion, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useBlacklistCheck } from '@/features/reputation/api';
import { useMailboxes } from '@/features/mailboxes/api';
import { formatDateTime } from '@/lib/format';

// Shown greyed-out before a check has run (or when no domain is available).
// The live result drives the names once a check returns.
const DEFAULT_PROVIDERS = [
  'Spamhaus ZEN',
  'Spamhaus DBL',
  'Barracuda',
  'SpamCop',
  'SORBS',
  'UCEPROTECT-1',
  'Lashback UBL',
];

type DotState = 'clear' | 'listed' | 'unknown';

function Dot({ state }: { state: DotState }) {
  if (state === 'clear') {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-accent">
        <ShieldCheck className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (state === 'listed') {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent3/15 text-accent3">
        <ShieldAlert className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-muted bg-surface-2 text-text-dim"
      title="Run a check to query the live blocklists."
    >
      <ShieldQuestion className="h-3.5 w-3.5" />
    </span>
  );
}

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

export function BlacklistCard() {
  const mailboxes = useMailboxes();
  const defaultDomain = useMemo(() => {
    const first = mailboxes.data?.items[0];
    return first ? domainOf(first.email_address) : '';
  }, [mailboxes.data]);

  const [domain, setDomain] = useState('');
  const activeDomain = domain || defaultDomain;
  const query = useBlacklistCheck(activeDomain);

  const data = query.data ?? null;
  const placeholderMode = !activeDomain || data === null;

  // Build the provider grid from the live result when we have it, otherwise
  // render the default names in the neutral "not yet checked" state.
  const rows: { name: string; state: DotState }[] = useMemo(() => {
    if (placeholderMode || !data) {
      return DEFAULT_PROVIDERS.map((name) => ({ name, state: 'unknown' as DotState }));
    }
    if (data.providers && data.providers.length > 0) {
      return data.providers.map((p) => ({
        name: p.name,
        state: (p.listed ? 'listed' : 'clear') as DotState,
      }));
    }
    return data.checked_against.map((name) => ({
      name,
      state: (data.hits.includes(name) ? 'listed' : 'clear') as DotState,
    }));
  }, [data, placeholderMode]);

  const hitCount = data?.hits.length ?? 0;
  const isListed = !placeholderMode && hitCount > 0;
  const isClear = !placeholderMode && !!data && hitCount === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-text-dim" /> Block list status
        </CardTitle>
        <CardDescription>
          Live blackhole-list checks against common DNS RBLs (Spamhaus, Barracuda, SpamCop & more).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder={defaultDomain || 'example.com'}
            value={domain}
            onChange={(e) => setDomain(e.target.value.trim())}
            aria-label="Domain to check"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!activeDomain || query.isFetching}
            leftIcon={<Search className="h-3.5 w-3.5" />}
            onClick={() => query.refetch()}
          >
            {query.isFetching ? 'Checking…' : 'Run check'}
          </Button>
        </div>

        {isListed ? (
          <div className="flex items-start gap-2 rounded-lg border border-accent3/40 bg-accent3/10 px-3 py-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent3" />
            <p className="text-xs text-text">
              Listed on {hitCount} of {rows.length}:{' '}
              <span className="font-medium text-accent3">{data?.hits.join(', ')}</span>. Request
              delisting from the affected provider(s) to restore inbox delivery.
            </p>
          </div>
        ) : isClear ? (
          <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
            <p className="text-xs text-text">
              All clear — not listed on any of the {rows.length} blocklists checked.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.name}
              className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2"
            >
              <Dot state={row.state} />
              <span className="truncate text-xs text-text">{row.name}</span>
            </div>
          ))}
        </div>

        {placeholderMode ? (
          <p className="text-[11px] text-text-dim">
            {activeDomain
              ? 'Run a check to query the live blocklists for this domain.'
              : 'Add a mailbox or type a domain above to run a block list check.'}
          </p>
        ) : data ? (
          <p className="text-[11px] text-text-dim">
            Checked {data.checked_against.length} lists for{' '}
            <span className="font-mono text-text">{data.domain}</span>
            {data.checked_ip ? (
              <>
                {' '}
                (IP <span className="font-mono text-text">{data.checked_ip}</span>)
              </>
            ) : null}{' '}
            at {formatDateTime(data.checked_at)}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
