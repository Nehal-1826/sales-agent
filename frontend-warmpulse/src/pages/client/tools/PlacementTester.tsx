import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { usePlan } from '@/lib/usePlan';
import { formatDateTime } from '@/lib/format';
import { useMailboxes } from '@/features/mailboxes/api';
import {
  isQuotaExceededError,
  usePlacementTest,
  usePlacementTestHistory,
  useStartPlacementTest,
  type PlacementProvider,
  type PlacementTest,
  type PlacementTestListItem,
  type ProviderBreakdown,
} from '@/features/placement/api';

// --------------------------------------------------------------------------- //
// Visual tokens — admin-token colours only.                                   //
// Inbox = accent (success-ish), Promotions = accent4 (mid),                   //
// Spam = accent3 (danger/warning), Other = text-dim, Timeout = border-muted.  //
// --------------------------------------------------------------------------- //

type Bucket = 'inbox' | 'promotions' | 'spam' | 'other' | 'timeout';

const BUCKET_META: Record<
  Bucket,
  { label: string; varColor: string; textClass: string }
> = {
  inbox: { label: 'Inbox', varColor: 'var(--wp-accent)', textClass: 'text-accent' },
  promotions: { label: 'Promotions', varColor: 'var(--wp-accent4)', textClass: 'text-accent4' },
  spam: { label: 'Spam', varColor: 'var(--wp-accent3)', textClass: 'text-accent3' },
  other: { label: 'Other', varColor: 'var(--wp-text-dim)', textClass: 'text-text-dim' },
  timeout: { label: 'Timeout', varColor: 'var(--wp-border-muted)', textClass: 'text-text-dim' },
};

const BUCKET_ORDER: Bucket[] = ['inbox', 'promotions', 'spam', 'other', 'timeout'];

// --------------------------------------------------------------------------- //
// Helpers                                                                     //
// --------------------------------------------------------------------------- //

function bucketFromSeedStatus(status: string): Bucket | 'pending' {
  switch (status) {
    case 'inbox':
      return 'inbox';
    case 'promotions':
      return 'promotions';
    case 'spam':
    case 'junk':
      return 'spam';
    case 'other':
      return 'other';
    case 'timeout':
      return 'timeout';
    default:
      return 'pending';
  }
}

function sumBreakdown(b: ProviderBreakdown): number {
  return b.inbox + b.promotions + b.spam + b.other + b.timeout;
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

// --------------------------------------------------------------------------- //
// Sub-components                                                              //
// --------------------------------------------------------------------------- //

function StackedBar({
  breakdown,
  total,
  height = 14,
}: {
  breakdown: ProviderBreakdown;
  total: number;
  height?: number;
}) {
  const segs = BUCKET_ORDER.map((b) => ({
    bucket: b,
    value: breakdown[b],
    pct: pct(breakdown[b], total),
  }));
  return (
    <div
      className="flex w-full overflow-hidden rounded-full border border-border-muted bg-surface-2"
      style={{ height }}
      role="img"
      aria-label="Inbox vs spam distribution"
    >
      {segs.map((s) =>
        s.value > 0 ? (
          <div
            key={s.bucket}
            title={`${BUCKET_META[s.bucket].label}: ${s.value} (${s.pct}%)`}
            style={{
              width: `${s.pct}%`,
              backgroundColor: BUCKET_META[s.bucket].varColor,
            }}
          />
        ) : null,
      )}
    </div>
  );
}

function Legend({ breakdown, total }: { breakdown: ProviderBreakdown; total: number }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {BUCKET_ORDER.map((b) => (
        <div key={b} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: BUCKET_META[b].varColor }}
          />
          <span className="text-text-dim">{BUCKET_META[b].label}</span>
          <span className={BUCKET_META[b].textClass + ' font-semibold'}>
            {breakdown[b]} ({pct(breakdown[b], total)}%)
          </span>
        </div>
      ))}
    </div>
  );
}

function ProviderCard({
  provider,
  breakdown,
}: {
  provider: PlacementProvider;
  breakdown: ProviderBreakdown;
}) {
  const total = sumBreakdown(breakdown);
  const label =
    provider === 'gmail'
      ? 'Gmail'
      : provider === 'outlook'
        ? 'Outlook'
        : provider === 'yahoo'
          ? 'Yahoo'
          : 'SMTP';
  return (
    <div className="rounded-xl border border-border-muted bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text">{label}</h4>
        <span className="text-xs text-text-dim">
          {total} seed{total === 1 ? '' : 's'}
        </span>
      </div>
      <StackedBar breakdown={breakdown} total={Math.max(total, 1)} height={10} />
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {BUCKET_ORDER.map((b) =>
          breakdown[b] > 0 ? (
            <span key={b} className={BUCKET_META[b].textClass}>
              {BUCKET_META[b].label} {pct(breakdown[b], Math.max(total, 1))}%
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function FinalResults({
  test,
  onRunAnother,
}: {
  test: PlacementTest;
  onRunAnother: () => void;
}) {
  const results = test.results;
  if (!results) return null;
  const total = results.total_seeds || sumBreakdown(results) || 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Inbox test results</CardTitle>
            <p className="mt-1 text-xs text-text-dim">
              {results.total_seeds} seeds · completed{' '}
              {test.completed_at ? formatDateTime(test.completed_at) : '—'}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onRunAnother}>
            Run another test
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-medium text-text">Where emails land</h3>
          <StackedBar breakdown={results} total={total} height={18} />
          <div className="mt-3">
            <Legend breakdown={results} total={total} />
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-medium text-text">By provider</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['gmail', 'outlook', 'yahoo'] as const).map((p) => (
              <ProviderCard
                key={p}
                provider={p}
                breakdown={
                  results.by_provider[p] ?? {
                    inbox: 0,
                    promotions: 0,
                    spam: 0,
                    other: 0,
                    timeout: 0,
                  }
                }
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LiveProgress({ test }: { test: PlacementTest }) {
  const totalExpected = test.seed_count || 0;
  const resolved = test.seeds_resolved || 0;
  const progressPct = totalExpected
    ? Math.min(100, Math.round((resolved / totalExpected) * 100))
    : 0;

  const statusText =
    test.status === 'created' || test.status === 'sending'
      ? 'Sending probes…'
      : `Waiting for landings… (${resolved} / ${totalExpected} reported)`;

  const seeds = test.seeds ?? [];
  // If the backend hasn't returned per-seed records yet, render placeholder
  // chips so the user sees the expected total.
  const chips: Array<{ key: string; bucket: Bucket | 'pending' }> = seeds.length
    ? seeds.map((s) => ({ key: s.id, bucket: bucketFromSeedStatus(s.status) }))
    : Array.from({ length: totalExpected }, (_, i) => ({
        key: `placeholder-${i}`,
        bucket: i < resolved ? ('inbox' as const) : ('pending' as const),
      }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test in progress</CardTitle>
        <p className="mt-1 text-xs text-text-dim">{statusText}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full transition-[width] duration-500 ease-out"
            style={{
              width: `${progressPct}%`,
              backgroundColor: 'var(--wp-accent)',
            }}
          />
        </div>

        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-dim">
            Seeds
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => {
              if (c.bucket === 'pending') {
                return (
                  <span
                    key={c.key}
                    className="h-5 w-10 rounded-full border border-border-muted bg-surface-2"
                    aria-label="Pending seed"
                  />
                );
              }
              const meta = BUCKET_META[c.bucket];
              return (
                <span
                  key={c.key}
                  className="inline-flex h-5 items-center rounded-full border border-border-muted px-2 text-[10px] font-semibold"
                  style={{ color: meta.varColor }}
                  title={meta.label}
                >
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UpgradeGate() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inbox Test is a Pro Plus feature</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-text-dim">
          Send a probe to ~30 inbox seeds and see where it lands across Gmail,
          Outlook and Yahoo — Inbox vs Promotions vs Spam.
        </p>
        <Button asChild>
          <Link to="/app/billing">Upgrade to Pro Plus</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function HistoryRow({
  item,
  mailboxEmail,
  onView,
}: {
  item: PlacementTestListItem;
  mailboxEmail: string;
  onView: (id: string) => void;
}) {
  const r = item.results;
  const total = r?.total_seeds || (r ? sumBreakdown(r) : 0) || 1;
  const inboxPct = r ? pct(r.inbox, total) : null;
  const spamPct = r ? pct(r.spam, total) : null;
  return (
    <tr className="border-b border-border-muted/60 last:border-0">
      <td className="py-2 pr-3 text-text-dim">
        {formatDateTime(item.created_at)}
      </td>
      <td className="py-2 pr-3 text-text">{mailboxEmail || item.mailbox_id}</td>
      <td className="py-2 pr-3 text-right">
        {inboxPct === null ? (
          <span className="text-text-dim">—</span>
        ) : (
          <span className="font-semibold text-accent">{inboxPct}%</span>
        )}
      </td>
      <td className="py-2 pr-3 text-right">
        {spamPct === null ? (
          <span className="text-text-dim">—</span>
        ) : (
          <span className="font-semibold text-accent3">{spamPct}%</span>
        )}
      </td>
      <td className="py-2 text-right">
        <button
          type="button"
          onClick={() => onView(item.id)}
          className="text-xs font-semibold text-accent hover:underline"
        >
          View details
        </button>
      </td>
    </tr>
  );
}

// --------------------------------------------------------------------------- //
// Main page                                                                   //
// --------------------------------------------------------------------------- //

export function PlacementTester() {
  const { isProPlus, isLoading: planLoading } = usePlan();
  const mailboxesQ = useMailboxes();
  const historyQ = usePlacementTestHistory();
  const startMut = useStartPlacementTest();

  const [selectedMailbox, setSelectedMailbox] = useState<string>('');
  const [activeTestId, setActiveTestId] = useState<string | null>(null);

  const testQ = usePlacementTest(activeTestId);

  const mailboxes = mailboxesQ.data?.items ?? [];
  const mailboxEmailById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of mailboxes) map[m.id] = m.email_address;
    return map;
  }, [mailboxes]);

  const onRun = () => {
    if (!selectedMailbox) return;
    startMut.mutate(
      { mailbox_id: selectedMailbox },
      {
        onSuccess: (data) => {
          setActiveTestId(data.test_id);
          toast.success('Inbox test started — probes are being sent now.');
        },
        onError: (err) => {
          if (isQuotaExceededError(err)) {
            toast.error(
              'Monthly inbox test limit reached — upgrade your plan for more tests.',
            );
          } else {
            toast.error('Could not start inbox test. Please try again.');
          }
        },
      },
    );
  };

  const onRunAnother = () => {
    setActiveTestId(null);
  };

  // Page header
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Inbox Test</h2>
          <span
            className="inline-flex items-center rounded-full border border-border-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent"
            title="Pro Plus feature"
          >
            Pro Plus
          </span>
        </div>
        <p className="text-sm text-text-dim">
          Send a probe to ~30 inbox seeds and see where it landed across
          Gmail/Outlook/Yahoo.
        </p>
      </div>
    </div>
  );

  if (planLoading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-surface-2/60" />;
  }

  if (!isProPlus) {
    return (
      <div className="space-y-6">
        {header}
        <UpgradeGate />
      </div>
    );
  }

  const activeTest = testQ.data ?? null;
  const showLive = activeTest && activeTest.status !== 'completed';
  const showResults = activeTest && activeTest.status === 'completed';

  return (
    <div className="space-y-6">
      {header}

      <Card>
        <CardHeader>
          <CardTitle>Run an inbox test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-dim">Mailbox</label>
              <AppSelect
                value={selectedMailbox}
                onValueChange={(v) => setSelectedMailbox(v)}
                disabled={mailboxesQ.isLoading || !mailboxes.length}
              >
                <AppSelectTrigger>
                  <AppSelectValue
                    placeholder={
                      mailboxesQ.isLoading
                        ? 'Loading mailboxes…'
                        : !mailboxes.length
                          ? 'No mailboxes connected'
                          : 'Choose a mailbox…'
                    }
                  />
                </AppSelectTrigger>
                <AppSelectContent>
                  {mailboxes.map((m) => (
                    <AppSelectItem key={m.id} value={m.id}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{
                            backgroundColor:
                              m.provider === 'gmail'
                                ? '#ea4335'
                                : m.provider === 'outlook'
                                  ? '#F26522'
                                  : m.provider === 'yahoo'
                                    ? '#F26522'
                                    : 'var(--wp-text-dim)',
                          }}
                        />
                        <span>{m.email_address}</span>
                        <span className="text-xs text-text-dim">({m.provider})</span>
                      </span>
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
            <Button
              type="button"
              size="lg"
              onClick={onRun}
              isLoading={startMut.isPending}
              disabled={
                !selectedMailbox || startMut.isPending || Boolean(showLive)
              }
            >
              Run inbox test
            </Button>
          </div>
          {!mailboxes.length && !mailboxesQ.isLoading ? (
            <p className="text-xs text-text-dim">
              Connect a mailbox first — go to{' '}
              <Link to="/app/mailboxes" className="text-accent underline">
                Mailboxes
              </Link>
              .
            </p>
          ) : null}
        </CardContent>
      </Card>

      {showLive ? <LiveProgress test={activeTest} /> : null}
      {showResults ? (
        <FinalResults test={activeTest} onRunAnother={onRunAnother} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent tests</CardTitle>
        </CardHeader>
        <CardContent>
          {historyQ.isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-surface-2/60" />
          ) : !historyQ.data || historyQ.data.items.length === 0 ? (
            <p className="text-sm text-text-dim">No inbox tests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-muted text-xs uppercase tracking-wide text-text-dim">
                    <th className="py-2 pr-3 text-left font-medium">When</th>
                    <th className="py-2 pr-3 text-left font-medium">Mailbox</th>
                    <th className="py-2 pr-3 text-right font-medium">Inbox</th>
                    <th className="py-2 pr-3 text-right font-medium">Spam</th>
                    <th className="py-2 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {historyQ.data.items.map((item) => (
                    <HistoryRow
                      key={item.id}
                      item={item}
                      mailboxEmail={
                        item.mailbox_email ?? mailboxEmailById[item.mailbox_id] ?? ''
                      }
                      onView={(id) => setActiveTestId(id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PlacementTester;
