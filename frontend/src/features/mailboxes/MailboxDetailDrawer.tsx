import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { X, Pause, Play, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AppTabs,
  AppTabsContent,
  AppTabsList,
  AppTabsTrigger,
} from '@/components/ui/AppTabs';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import { extractErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import {
  useMailboxDetail,
  usePauseMailbox,
  useResumeMailbox,
  useRecheckDns,
  useDeleteMailbox,
  type DnsIndicators,
} from './api';
import { RampCurveChart, DEFAULT_RAMP } from './RampCurveChart';
import { DailySendsChart } from './DailySendsChart';

interface MailboxDetailDrawerProps {
  mailboxId: string | null;
  onClose: () => void;
}

function dnsColor(status: DnsIndicators[keyof DnsIndicators]) {
  if (status === 'valid') return 'green';
  if (status === 'invalid' || status === 'missing') return 'orange';
  return 'neutral';
}

function WarmthBadge({ score }: { score: number }) {
  const v = score < 40 ? 'orange' : score < 70 ? 'yellow' : 'green';
  return <Badge variant={v}>Warmth {Math.round(score)}</Badge>;
}

export function MailboxDetailDrawer({ mailboxId, onClose }: MailboxDetailDrawerProps) {
  const isOpen = !!mailboxId;
  const { data, isLoading, isError } = useMailboxDetail(mailboxId);
  const pause = usePauseMailbox();
  const resume = useResumeMailbox();
  const recheck = useRecheckDns();
  const remove = useDeleteMailbox();

  // Close on escape.
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  const ramp = data?.ramp_schedule && data.ramp_schedule.length > 0 ? data.ramp_schedule : DEFAULT_RAMP;
  const actualByDay = new Map(data?.daily_actuals?.map((d) => [d.day, d.actual]) ?? []);
  const rampMerged = ramp.map((r) => ({ ...r, actual: actualByDay.get(r.day) ?? undefined }));

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Mailbox details"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={cn(
              'fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col',
              'border-l border-border-muted bg-surface shadow-2xl',
            )}
          >
            <header className="flex items-start justify-between gap-3 border-b border-border-muted p-5">
              <div className="min-w-0">
                {isLoading ? (
                  <Skeleton className="h-6 w-48" />
                ) : (
                  <h2 className="truncate text-lg font-semibold">{data?.email_address}</h2>
                )}
                {data ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-dim">
                    <Badge variant="neutral">{data.provider}</Badge>
                    <Badge variant={data.is_paused ? 'neutral' : 'green'}>
                      {data.is_paused ? 'Paused' : data.status}
                    </Badge>
                    <span>Day {data.current_day}</span>
                    <span>•</span>
                    <span>{data.daily_target}/day</span>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                className="rounded-md p-1.5 text-text-dim transition-colors hover:bg-surface-2 hover:text-text focus-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto hide-scrollbar p-5" data-lenis-prevent>
              {isError ? (
                <EmptyState title="Couldn't load mailbox" description="Try again in a moment." />
              ) : (
                <AppTabs defaultValue="overview">
                  <AppTabsList>
                    <AppTabsTrigger value="overview">Overview</AppTabsTrigger>
                    <AppTabsTrigger value="config">Warmup Config</AppTabsTrigger>
                    <AppTabsTrigger value="threads">Thread Viewer</AppTabsTrigger>
                    <AppTabsTrigger value="dns">Domain (DNS)</AppTabsTrigger>
                    <AppTabsTrigger value="danger">Danger Zone</AppTabsTrigger>
                  </AppTabsList>

                  <AppTabsContent value="overview" className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {data ? <WarmthBadge score={data.warmth_score} /> : null}
                      <Badge variant="neutral">Day {data?.current_day}</Badge>
                      <Badge variant="neutral">Mode {data?.content_mode}</Badge>
                    </div>
                    <RampCurveChart data={rampMerged} isLoading={isLoading} />
                    <DailySendsChart
                      data={(data?.daily_actuals ?? []).map((d) => ({ date: d.date, actual: d.actual }))}
                      isLoading={isLoading}
                    />
                  </AppTabsContent>

                  <AppTabsContent value="config" className="space-y-3">
                    <div className="rounded-lg border border-border-muted p-4 text-sm">
                      <dl className="grid grid-cols-2 gap-3">
                        <div>
                          <dt className="text-xs text-text-dim">Daily target</dt>
                          <dd className="font-medium">{data?.daily_target ?? '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-dim">Content mode</dt>
                          <dd className="font-medium">{data?.content_mode ?? '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-dim">Status</dt>
                          <dd className="font-medium">{data?.is_paused ? 'Paused' : data?.status}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-dim">Schedule window</dt>
                          <dd className="font-medium">
                            {data?.schedule_window
                              ? `${data.schedule_window.start_hour}:00–${data.schedule_window.end_hour}:00 ${data.schedule_window.tz}`
                              : 'Anytime'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <p className="text-xs text-text-dim">
                      Full edit form lives on a later backend version. The values above are read-only here.
                    </p>
                  </AppTabsContent>

                  <AppTabsContent value="threads">
                    {data?.threads && data.threads.length > 0 ? (
                      <ul className="divide-y divide-border-muted rounded-lg border border-border-muted bg-surface">
                        {data.threads.map((t) => (
                          <li key={t.id} className="p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{t.subject}</p>
                                <p className="truncate text-xs text-text-dim">with {t.peer_email}</p>
                              </div>
                              <Badge variant="neutral">{t.messages_count} msgs</Badge>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState
                        title="No threads yet"
                        description="Warmup threads will appear here once conversations start."
                      />
                    )}
                  </AppTabsContent>

                  <AppTabsContent value="dns" className="space-y-3">
                    {isLoading ? (
                      <Skeleton className="h-40 w-full" />
                    ) : data ? (
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          {(['spf', 'dkim', 'dmarc'] as const).map((k) => (
                            <div
                              key={k}
                              className="rounded-lg border border-border-muted bg-surface-2/40 p-3"
                            >
                              <div className="mb-1 flex items-center justify-between">
                                <span className="text-xs font-medium uppercase">{k}</span>
                                <Badge variant={dnsColor(data.dns[k])}>{data.dns[k]}</Badge>
                              </div>
                              <p className="text-xs text-text-dim">
                                {data.dns[k] === 'valid'
                                  ? 'Record looks good.'
                                  : 'Action required — check your DNS.'}
                              </p>
                            </div>
                          ))}
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<RefreshCw className="h-4 w-4" />}
                          disabled={recheck.isPending}
                          onClick={() =>
                            recheck.mutate(data.id, {
                              onSuccess: () => toast.success('DNS re-checked'),
                              onError: () => toast.error('DNS check failed'),
                            })
                          }
                        >
                          {recheck.isPending ? 'Checking…' : 'Recheck now'}
                        </Button>
                      </>
                    ) : null}
                  </AppTabsContent>

                  <AppTabsContent value="danger" className="space-y-3">
                    <div className="rounded-lg border border-accent3/30 bg-accent3/5 p-4">
                      <h4 className="text-sm font-semibold text-accent3">Danger zone</h4>
                      <p className="mt-1 text-xs text-text-dim">
                        These actions are irreversible. Pause stops all outbound warmup immediately.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {data?.is_paused ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Play className="h-4 w-4" />}
                            onClick={() =>
                              data &&
                              resume.mutate(data.id, {
                                onSuccess: () => toast.success('Mailbox resumed'),
                              })
                            }
                          >
                            Resume warmup
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Pause className="h-4 w-4" />}
                            onClick={() =>
                              data &&
                              pause.mutate(data.id, {
                                onSuccess: () => toast.success('Mailbox paused'),
                              })
                            }
                          >
                            Pause warmup
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          size="sm"
                          leftIcon={<Trash2 className="h-4 w-4" />}
                          onClick={async () => {
                            if (!data) return;
                            const ok = await confirm({
                              title: 'Delete mailbox?',
                              description: `${data.email_address} and its entire warmup history will be removed. This cannot be undone.`,
                              confirmLabel: 'Delete',
                              danger: true,
                            });
                            if (!ok) return;
                            remove.mutate(data.id, {
                              onSuccess: () => {
                                toast.success('Mailbox deleted');
                                onClose();
                              },
                              onError: (err) =>
                                toast.error(
                                  extractErrorMessage(err, 'Failed to delete mailbox'),
                                ),
                            });
                          }}
                        >
                          Delete mailbox
                        </Button>
                      </div>
                    </div>
                  </AppTabsContent>
                </AppTabs>
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
