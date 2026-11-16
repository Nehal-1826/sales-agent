import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AxiosError } from 'axios';
import { LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/AppToast';
import { useAuthStore } from '@/stores/auth';
import { useProPlusCanvasData } from '@/features/reports/useProPlusCanvasData';
import {
  useCreateScheduledReport,
  useDownloadReport,
  useEmailReport,
  useGenerateReport,
  type ReportFrequency,
} from '@/features/reports/api';
import {
  ProPlusRpt2Canvas,
  type CanvasExportOpts,
  type MockMailbox,
  type RangeKey,
  type ScopeKey,
} from '../proplus/ProPlusRpt2Canvas';

/**
 * /app/reports for Pro-Plus-tier users.
 *
 * Renders the "Report Builder Canvas" design (`ProPlusRpt2Canvas`) wired to
 * REAL workspace data via `useProPlusCanvasData()`. The empty / loading UX
 * mirrors the sibling Pro-Plus reputation wrapper
 * (`reputation/ProPlusReputation`): 0 mailboxes → the "complete onboarding"
 * EmptyState with the same "Reports" page heading; while the mailbox list is
 * still loading → a lightweight skeleton.
 *
 * NOTE: this is the LIVE wrapper at `reports/ProPlusReports.tsx` — distinct
 * from the prop-less `proplus/ProPlusReports.tsx` used by the isolated :35001
 * design preview harness.
 *
 * The toolbar's "Export" and "Email this report" actions are owned HERE (the
 * canvas itself renders prop-less in the design preview, which has no
 * QueryClientProvider in scope, so the mutations cannot live inside it). We
 * thread `onExport` / `onEmail` down; the canvas calls them with its current
 * format / range / scope / schedule selection.
 *
 * The backend `generate`/`email` endpoints take a single report `kind`; the
 * Pro-Plus multi-block document maps to the comprehensive `white_label`
 * variant (per-mailbox rollup) — the closest match to a full composed report.
 */

/** RangeKey → concrete `from`/`to` ISO dates anchored on today. */
function rangeDates(range: RangeKey): { from: string; to: string } {
  const days = range === '7d' ? 7 : range === '14d' ? 14 : range === '90d' ? 90 : 30;
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - days);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/**
 * Resolve the document scope to concrete mailbox ids.
 * `all` → undefined (backend includes every workspace mailbox).
 * `gmail` → only Gmail mailboxes. `top5` → the 5 highest-warmth mailboxes.
 */
function resolveMailboxIds(
  scope: ScopeKey,
  mailboxes: MockMailbox[],
): string[] | undefined {
  if (scope === 'all') return undefined;
  if (scope === 'gmail') {
    return mailboxes.filter((m) => m.provider === 'gmail').map((m) => m.id);
  }
  // top5
  return [...mailboxes]
    .sort((a, b) => b.warmth - a.warmth)
    .slice(0, 5)
    .map((m) => m.id);
}

/** Mirror GenerateReportDialog's backend-aware error toast. */
function reportError(err: unknown, fallback: string): void {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    const detail = err.response?.data?.detail;
    const detailStr =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object' && 'error' in detail
          ? String((detail as { error: unknown }).error)
          : null;
    if (status === 501) {
      toast.error(detailStr ?? 'PDF generator not installed — try CSV instead.');
      return;
    }
    if (status === 400) {
      toast.error(detailStr ?? 'Invalid request — check the date range.');
      return;
    }
    if (detailStr) {
      toast.error(detailStr);
      return;
    }
  }
  toast.error(fallback);
}

export function ProPlusReports() {
  const { data, isLoading } = useProPlusCanvasData();
  const userEmail = useAuthStore((s) => s.user?.email ?? null);

  const generate = useGenerateReport();
  const download = useDownloadReport();
  const email = useEmailReport();
  const createSchedule = useCreateScheduledReport();

  const handleExport = (opts: CanvasExportOpts) => {
    const { from, to } = rangeDates(opts.range);
    generate.mutate(
      {
        type: 'white_label',
        format: opts.format,
        from,
        to,
        mailbox_ids: resolveMailboxIds(opts.scope, data?.mailboxes ?? []),
      },
      {
        onSuccess: (report) => {
          download.mutate(report, {
            onSuccess: () => toast.success('Report exported — download started'),
            onError: () =>
              toast.error('Report generated, but the download failed — try again.'),
          });
        },
        onError: (err) => reportError(err, 'Failed to export report — try again.'),
      },
    );
  };

  const handleEmail = (opts: CanvasExportOpts) => {
    const { from, to } = rangeDates(opts.range);
    const mailbox_ids = resolveMailboxIds(opts.scope, data?.mailboxes ?? []);
    email.mutate(
      { type: 'white_label', format: opts.format, from, to, mailbox_ids },
      {
        onSuccess: (res) => {
          if (res.status === 'sent') {
            toast.success(`Report emailed to ${res.recipients.join(', ')}`);
          } else if (res.status === 'dry_run') {
            toast.success('Report generated — email delivery is in dry-run here.');
          } else {
            toast.error('Could not deliver the report email.');
          }
          // Honour the schedule toggle: weekly/monthly creates a recurring
          // report to the signed-in user so the selection isn't cosmetic.
          if (opts.schedule !== 'once' && userEmail) {
            createSchedule.mutate(
              {
                type: 'white_label',
                frequency: opts.schedule as ReportFrequency,
                recipients: [userEmail],
                format: opts.format,
              },
              {
                onSuccess: () =>
                  toast.success(`Scheduled a ${opts.schedule} report to ${userEmail}`),
                onError: () =>
                  toast.error('Emailed now, but scheduling the recurrence failed.'),
              },
            );
          }
        },
        onError: (err) => reportError(err, 'Failed to email report — try again.'),
      },
    );
  };

  // 0-mailbox empty state — same CTA / heading as the legacy reports page.
  if (!isLoading && data === null) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-1"
        >
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-text-dim">
            Compose inbox delivery reports block-by-block, once mailboxes are
            connected.
          </p>
        </motion.div>
        <EmptyState
          icon={<LayoutTemplate className="h-5 w-5" />}
          title="No mailboxes connected"
          description="Finish onboarding to connect your first mailbox and start warming up."
          action={
            <Button asChild variant="primary">
              <Link to="/onboarding">Complete onboarding</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // Still resolving the mailbox list — lightweight skeleton matching the
  // toolbar height + the 3-zone builder board (palette / canvas / inspector).
  if (isLoading || data === null) {
    return (
      <div className="space-y-3">
        <div className="h-16 w-full animate-pulse rounded-xl bg-surface-2/60" />
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-3 h-[34rem] animate-pulse rounded-xl bg-surface-2/60" />
          <div className="col-span-6 h-[34rem] animate-pulse rounded-xl bg-surface-2/60" />
          <div className="col-span-3 h-[34rem] animate-pulse rounded-xl bg-surface-2/60" />
        </div>
      </div>
    );
  }

  return (
    <ProPlusRpt2Canvas
      data={data ?? undefined}
      onExport={handleExport}
      onEmail={handleEmail}
      exporting={generate.isPending || download.isPending}
      emailing={email.isPending || createSchedule.isPending}
    />
  );
}

export default ProPlusReports;
