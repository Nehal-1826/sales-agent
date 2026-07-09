import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  CalendarRange,
  Check,
  Crown,
  Download,
  FileSpreadsheet,
  FileText,
  Mail,
  Send,
  Sparkles,
  Target,
  Users,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from '@/components/ui/AppToast';
import { useMailboxes } from '@/features/mailboxes/api';
import { useDailyMetrics, usePlacementTrend } from '@/features/analytics/api';
import type {
  DailyMetricRow,
  PlacementTrendPoint,
} from '@/features/analytics/types';
import {
  useCreateScheduledReport,
  useDownloadReport,
  useEmailReport,
  useGenerateReport,
  useReports,
  type GeneratedReport,
  type ReportFormat,
  type ReportType,
} from '@/features/reports/api';
import type { MailboxProvider } from '@/features/mailboxes/types';
import { usePlan } from '@/lib/usePlan';
import { formatDate, formatNumber } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
// TODO: lift pro-reports.css into pages/client/reports/ in a follow-up.
import '@/pages/client-design-preview/pro-reports/pro-reports.css';

/**
 * /app/reports for Pro tier — R2 Builder Workspace.
 *
 * End-to-end flow:
 * - The form on the left drives a live preview on the right that reacts to
 *   every input (type / format / range / mailbox selection / schedule).
 * - "Generate now" calls /workspace/reports/generate, persists a row, and
 *   surfaces a download link.
 * - "Email to me" calls /workspace/reports/email — dry-run friendly so signup
 *   environments without TRANSACTIONAL_SMTP_HOST still ack cleanly.
 * - Picking weekly/monthly + clicking Generate also creates a scheduled
 *   report via /workspace/reports/scheduled so the digest runs on cadence.
 * - The "Recently generated" panel below the preview pulls from
 *   /workspace/reports and invalidates after every mutation.
 */

const REPORT_TYPE_META: Record<
  ReportType,
  { label: string; tone: 'violet' | 'cyan' | 'green' | 'yellow'; Icon: LucideIcon }
> = {
  warmth: { label: 'Warmth', tone: 'violet', Icon: Sparkles },
  engagement: { label: 'Opens & Replies', tone: 'cyan', Icon: BarChart3 },
  placement: { label: 'Where Emails Land', tone: 'green', Icon: Target },
  white_label: { label: 'White-label', tone: 'yellow', Icon: Crown },
};

type Schedule = 'once' | 'weekly' | 'monthly';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(d: number): string {
  const t = new Date();
  t.setDate(t.getDate() - d);
  return t.toISOString().slice(0, 10);
}

function ProviderSwatch({
  provider,
  size = 18,
}: {
  provider: MailboxProvider;
  size?: number;
}) {
  const letter =
    provider === 'gmail' ? 'G' : provider === 'outlook' ? 'O' : provider === 'yahoo' ? 'Y' : 'S';
  return (
    <span
      className={`mb-provider mb-provider--${provider}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {letter}
    </span>
  );
}

function formatBytes(b: number | undefined): string {
  if (!b || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

export function ProReports() {
  const mailboxesQuery = useMailboxes();
  const reportsQuery = useReports();
  const generate = useGenerateReport();
  const emailMut = useEmailReport();
  const createSchedule = useCreateScheduledReport();
  const downloadMut = useDownloadReport();
  const { isAgency } = usePlan();
  const userEmail = useAuthStore((s) => s.user?.email ?? null);

  // White-label is an Agency-tier deliverable (branded, agency-facing). Hide
  // the report-type tile for non-Agency plans so they can't request it.
  const availableTypes = useMemo(
    () =>
      (Object.keys(REPORT_TYPE_META) as ReportType[]).filter(
        (t) => t !== 'white_label' || isAgency,
      ),
    [isAgency],
  );

  const mailboxes = useMemo(
    () => mailboxesQuery.data?.items ?? [],
    [mailboxesQuery.data?.items],
  );

  const [type, setType] = useState<ReportType>('warmth');
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [schedule, setSchedule] = useState<Schedule>('weekly');
  const [selectedMailboxes, setSelectedMailboxes] = useState<Set<string>>(
    () => new Set(),
  );
  // Track whether the user has explicitly touched the mailbox selection so
  // we don't keep clobbering their picks every time the mailboxes query
  // refetches.
  const [userTouched, setUserTouched] = useState(false);

  // Default-select all mailboxes once they load, idempotently.
  useEffect(() => {
    if (!userTouched && mailboxes.length > 0 && selectedMailboxes.size === 0) {
      setSelectedMailboxes(new Set(mailboxes.map((m) => m.id)));
    }
  }, [mailboxes, selectedMailboxes.size, userTouched]);

  // If the active report type is no longer available (e.g. white_label while
  // not Agency), fall back to warmth so the form stays consistent.
  useEffect(() => {
    if (!availableTypes.includes(type)) setType('warmth');
  }, [availableTypes, type]);

  const meta = REPORT_TYPE_META[type];
  const Icon = meta.Icon;

  const toggleMb = (id: string) => {
    setUserTouched(true);
    setSelectedMailboxes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rangeDays = schedule === 'once' ? 30 : schedule === 'weekly' ? 7 : 30;
  const from = useMemo(() => daysAgoIso(rangeDays), [rangeDays]);
  const to = useMemo(() => todayIso(), []);
  const rangeLabel = `${from} → ${to}`;

  // Sorted ids so two equivalent selections produce the same key — keeps the
  // preview from re-mounting purely from Set iteration order.
  const selectedIdsKey = useMemo(
    () => Array.from(selectedMailboxes).sort().join('|'),
    [selectedMailboxes],
  );

  const previewKey = `${type}-${format}-${schedule}-${from}-${to}-${selectedIdsKey}`;
  const hasMailboxes = selectedMailboxes.size > 0;

  // --- Live preview from REAL metrics --------------------------------------
  // The preview cover is a genuine preview of the report's headline number +
  // trend, computed from the same daily-metrics / placement data the export
  // will use. When exactly one mailbox is selected we scope to it; otherwise
  // the workspace-wide aggregate is shown (matches a multi-mailbox report).
  const previewMailboxId = useMemo(
    () => (selectedMailboxes.size === 1 ? Array.from(selectedMailboxes)[0] : undefined),
    [selectedMailboxes],
  );
  const metricsQuery = useDailyMetrics({ from, to, mailbox_id: previewMailboxId });
  const placementQuery = usePlacementTrend({ from, to, mailbox_id: previewMailboxId });

  const preview = useMemo(() => {
    const rows = metricsQuery.data ?? [];
    const place = placementQuery.data ?? [];
    const avg = (xs: number[]) =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

    // 7-bucket downsample of a series, normalised to 0..100 for the bar chart.
    const sample = (vals: number[]): number[] => {
      if (vals.length === 0) return [];
      const buckets = 7;
      const step = vals.length / buckets;
      const out: number[] = [];
      for (let i = 0; i < buckets; i++) {
        const slice = vals.slice(Math.floor(i * step), Math.max(Math.floor((i + 1) * step), Math.floor(i * step) + 1));
        out.push(avg(slice));
      }
      const max = Math.max(...out, 1);
      return out.map((v) => Math.round((v / max) * 100));
    };

    const totalSent = sum(rows.map((r) => r.sent));
    const totalOpened = sum(rows.map((r) => r.opened));
    const totalReplied = sum(rows.map((r) => r.replied));
    const avgWarmth = Math.round(avg(rows.map((r) => r.warmth_score)));
    const openRate = totalSent ? Math.round((totalOpened / totalSent) * 100) : 0;
    const replyRate = totalSent ? Math.round((totalReplied / totalSent) * 100) : 0;
    const avgInbox = Math.round(avg(place.map((p) => p.inbox_pct)));

    let heroNum: string;
    let heroLbl: string;
    let bars: number[];
    if (type === 'warmth') {
      heroNum = String(avgWarmth);
      heroLbl = 'avg warmth';
      bars = sample(rows.map((r) => r.warmth_score));
    } else if (type === 'engagement') {
      heroNum = `${openRate}%`;
      heroLbl = 'open rate';
      bars = sample(rows.map((r) => r.opened));
    } else if (type === 'placement') {
      heroNum = `${avgInbox}%`;
      heroLbl = 'inbox';
      bars = sample(place.map((p) => p.inbox_pct));
    } else {
      heroNum = String(selectedMailboxes.size);
      heroLbl = 'mailboxes';
      bars = sample(rows.map((r) => r.warmth_score));
    }
    return {
      heroNum,
      heroLbl,
      bars,
      stats: {
        totalSent,
        totalOpened,
        totalReplied,
        avgWarmth,
        openRate,
        replyRate,
        avgInbox,
        days: rows.length,
      },
      loading: metricsQuery.isLoading || placementQuery.isLoading,
      empty: rows.length === 0 && place.length === 0,
    };
  }, [metricsQuery.data, metricsQuery.isLoading, placementQuery.data, placementQuery.isLoading, type, selectedMailboxes]);

  const heroNum = preview.loading ? '·' : preview.empty ? '—' : preview.heroNum;
  const heroLbl = preview.heroLbl;

  const handleGenerate = async () => {
    if (!hasMailboxes) {
      toast.error('Pick at least one mailbox first.');
      return;
    }
    try {
      const r = await generate.mutateAsync({
        type,
        format,
        from,
        to,
        mailbox_ids: Array.from(selectedMailboxes),
      });
      toast.success(`Report ready · ${meta.label} ${format.toUpperCase()}`);
      // If the user picked a recurring schedule, register it as well so the
      // future digest runs automatically. Errors here shouldn't mask the
      // successful generate — surface them but don't roll the toast back.
      if (schedule !== 'once') {
        // The backend requires at least one recipient (ScheduledReportCreate
        // enforces min_length=1) — default to the signed-in user's email so
        // "Generate now" on a weekly/monthly schedule doesn't 422.
        if (!userEmail) {
          toast.error('Add an email to your account to schedule recurring reports.');
        } else {
          try {
            await createSchedule.mutateAsync({
              type,
              frequency: schedule,
              recipients: [userEmail],
              format,
            });
            toast.success(`Scheduled · ${schedule} ${meta.label}`);
          } catch {
            toast.error('Could not schedule recurring report.');
          }
        }
      }
      return r;
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 501) {
        toast.error('PDF generation needs reportlab on the server. Use CSV.');
      } else {
        toast.error("Couldn't generate report. Try again or check server logs.");
      }
    }
  };

  const handleEmail = async () => {
    if (!hasMailboxes) {
      toast.error('Pick at least one mailbox first.');
      return;
    }
    try {
      const r = await emailMut.mutateAsync({
        type,
        format,
        from,
        to,
        mailbox_ids: Array.from(selectedMailboxes),
      });
      if (r.status === 'sent') {
        toast.success(`Emailed to ${r.recipients.join(', ')}`);
      } else if (r.status === 'dry_run') {
        toast.success(
          'Queued for delivery. (Mail server not configured — admins see this in the logs.)',
        );
      } else if (r.status === 'failed') {
        toast.error("Couldn't deliver report. Saved to Recently generated.");
      } else {
        toast.success('Email dispatched.');
      }
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 501) {
        toast.error('PDF generation needs reportlab on the server. Use CSV.');
      } else {
        toast.error("Couldn't email report.");
      }
    }
  };

  const recent: GeneratedReport[] = (reportsQuery.data?.generated ?? []).slice(0, 5);
  const isWorking = generate.isPending || emailMut.isPending;

  return (
    <div className="r2">
      <aside className="r2__controls">
        <header className="r2__controls-head">
          <span className="r2-eyebrow">
            <Wand2 size={11} strokeWidth={2.4} />
            Build a report
          </span>
          <h2 className="r2__controls-title">Configure &amp; preview</h2>
        </header>

        <section className="r2__section">
          <label className="r2__label">Report type</label>
          <div className="r2__type-grid">
            {availableTypes.map((t) => {
              const m = REPORT_TYPE_META[t];
              const TIcon = m.Icon;
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`r2__type r2__type--${m.tone} ${active ? 'r2__type--active' : ''}`}
                >
                  <span className={`r2__type-icon r2__type-icon--${m.tone}`}>
                    <TIcon size={12} strokeWidth={2.4} />
                  </span>
                  <span className="r2__type-name">{m.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="r2__section">
          <label className="r2__label">Format</label>
          <div className="r2__format">
            <button
              type="button"
              onClick={() => setFormat('pdf')}
              className={`r2__fmt ${format === 'pdf' ? 'r2__fmt--active' : ''}`}
            >
              <FileText size={12} strokeWidth={2.4} />
              <span>PDF</span>
              <span className="r2__fmt-sub">Polished for sharing</span>
            </button>
            <button
              type="button"
              onClick={() => setFormat('csv')}
              className={`r2__fmt ${format === 'csv' ? 'r2__fmt--active' : ''}`}
            >
              <FileSpreadsheet size={12} strokeWidth={2.4} />
              <span>CSV</span>
              <span className="r2__fmt-sub">Crunch the numbers</span>
            </button>
          </div>
        </section>

        <section className="r2__section">
          <label className="r2__label">Range</label>
          <div className="r2__range">
            <CalendarRange size={11} strokeWidth={2.4} />
            <span>Last {rangeDays} days</span>
            <span className="r2__range-sub">{rangeLabel}</span>
          </div>
        </section>

        <section className="r2__section">
          <label className="r2__label">
            <Users size={11} strokeWidth={2.4} />
            Mailboxes ({selectedMailboxes.size}/{mailboxes.length})
          </label>
          <div className="r2__mbs">
            {mailboxes.length === 0 ? (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--wp-text-faint)',
                  fontStyle: 'italic',
                }}
              >
                Connect a mailbox first
              </span>
            ) : (
              mailboxes.map((m) => {
                const checked = selectedMailboxes.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMb(m.id)}
                    className={`r2__mb ${checked ? 'r2__mb--checked' : ''}`}
                  >
                    <ProviderSwatch provider={m.provider} size={18} />
                    <span>{m.email_address.split('@')[0]}</span>
                    {checked && <span className="r2__mb-tick" aria-hidden />}
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="r2__section">
          <label className="r2__label">Schedule</label>
          <div className="r2__schedule">
            {(['once', 'weekly', 'monthly'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSchedule(s)}
                className={`r2__sched ${schedule === s ? 'r2__sched--active' : ''}`}
              >
                {s === 'once'
                  ? 'One-off'
                  : s === 'weekly'
                    ? 'Weekly · Mondays'
                    : 'Monthly · 1st'}
              </button>
            ))}
          </div>
        </section>

        <footer className="r2__controls-foot">
          <button
            type="button"
            className="r2-btn r2-btn--ghost"
            onClick={handleEmail}
            disabled={isWorking || !hasMailboxes}
          >
            <Mail size={11} strokeWidth={2.4} />
            {emailMut.isPending ? 'Sending…' : 'Email to me'}
          </button>
          <button
            type="button"
            className="r2-btn r2-btn--primary"
            onClick={handleGenerate}
            disabled={isWorking || !hasMailboxes}
          >
            <Send size={11} strokeWidth={2.4} />
            {generate.isPending ? 'Generating…' : 'Generate now'}
          </button>
        </footer>

        {generate.isSuccess && generate.data && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 12px',
              fontSize: 11,
              color: 'var(--wp-success)',
              background: 'color-mix(in srgb, var(--wp-success) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--wp-success) 28%, transparent)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Check size={12} strokeWidth={2.6} aria-hidden />
            Report ready —{' '}
            <button
              type="button"
              onClick={() => generate.data && downloadMut.mutate(generate.data)}
              style={{
                color: 'var(--wp-success)',
                textDecoration: 'underline',
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              download
            </button>
            .
          </div>
        )}
        {generate.isError && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 12px',
              fontSize: 11,
              color: 'var(--wp-danger)',
              background: 'color-mix(in srgb, var(--wp-danger) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--wp-danger) 28%, transparent)',
              borderRadius: 8,
            }}
          >
            Couldn't generate report. Try again or check the server logs.
          </div>
        )}
      </aside>

      <motion.section
        key={previewKey}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="r2__preview"
      >
        <header className="r2__preview-head">
          <span className="r2-eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            Live preview
          </span>
          <span className="r2__preview-meta">
            {format.toUpperCase()} · {schedule}
          </span>
        </header>

        {format === 'csv' ? (
          <CsvPreview
            type={type}
            tone={meta.tone}
            label={meta.label}
            rangeLabel={rangeLabel}
            mailboxCount={selectedMailboxes.size}
            metricsRows={metricsQuery.data ?? []}
            placementRows={placementQuery.data ?? []}
            loading={preview.loading}
            empty={preview.empty}
          />
        ) : (
          <div className={`r2__cover r2__cover--${meta.tone}`}>
            <div className="r2__cover-band">
              <span className="r2__cover-eyebrow">WARMPULSE · REPORT</span>
              <h3 className="r2__cover-title">{meta.label} report</h3>
              <span className="r2__cover-meta">
                {rangeLabel} · {selectedMailboxes.size} mailboxes
              </span>
            </div>
            <div className="r2__cover-hero">
              <Icon size={56} strokeWidth={1.6} className="r2__cover-hero-icon" />
              <span className="r2__cover-hero-stat">
                <span className="r2__cover-hero-num">{heroNum}</span>
                <span className="r2__cover-hero-lbl">{heroLbl}</span>
              </span>
            </div>
            <div className="r2__cover-body">
              {preview.empty ? (
                <div
                  style={{
                    fontSize: 12,
                    color: '#6b7280',
                    padding: '24px 0',
                    textAlign: 'center',
                  }}
                >
                  No metrics in this range yet — the report will populate once
                  warmup activity is recorded for the selected mailboxes.
                </div>
              ) : (
                <>
                  <div className="r2__cover-stats">
                    <span className="r2__cover-stat">
                      <b>{formatNumber(preview.stats.totalSent)}</b> sent
                    </span>
                    <span className="r2__cover-stat">
                      <b>{preview.stats.openRate}%</b> opened
                    </span>
                    <span className="r2__cover-stat">
                      <b>{preview.stats.replyRate}%</b> replied
                    </span>
                    <span className="r2__cover-stat">
                      <b>{preview.stats.avgInbox || '—'}%</b> inbox
                    </span>
                  </div>
                  <div className="r2__cover-chart">
                    {(preview.bars.length ? preview.bars : [0, 0, 0, 0, 0, 0, 0]).map(
                      (h, i) => (
                        <span
                          key={i}
                          style={{ height: `${Math.max(h, 4)}%` }}
                          className={`r2__cover-bar r2__cover-bar--${meta.tone}`}
                        />
                      ),
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#6b7280',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{preview.stats.days} days of data</span>
                    <span>avg warmth {preview.stats.avgWarmth}</span>
                  </div>
                </>
              )}
            </div>
            <footer className="r2__cover-foot">
              <span>WarmPulse · {formatDate(new Date())}</span>
              <span>Cover preview</span>
            </footer>
          </div>
        )}

        {/* P5: small caveat so the user knows the preview is illustrative —
            the downloaded artifact uses the same underlying aggregates and
            their workspace branding when produced server-side. */}
        <p
          style={{
            width: '100%',
            maxWidth: 480,
            margin: '-4px 0 0',
            fontSize: 11,
            color: 'var(--wp-text-faint)',
            fontStyle: 'italic',
            textAlign: 'center',
          }}
        >
          Preview is illustrative — final {format.toUpperCase()} will use the
          same data and your workspace branding.
        </p>

        <RecentlyGenerated
          items={recent}
          onDownload={(r) => downloadMut.mutate(r)}
          loading={reportsQuery.isLoading}
        />
      </motion.section>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// CSV preview                                                                 //
// --------------------------------------------------------------------------- //
// P5: when format=csv the live preview shows a tabular sample (header row +
// up to 5 data rows) drawn from the same real daily-metrics / placement-trend
// data the export will use. Columns are picked per report type so the
// preview matches what the backend will write into the downloaded CSV.

interface CsvPreviewProps {
  type: ReportType;
  tone: 'violet' | 'cyan' | 'green' | 'yellow';
  label: string;
  rangeLabel: string;
  mailboxCount: number;
  metricsRows: DailyMetricRow[];
  placementRows: PlacementTrendPoint[];
  loading: boolean;
  empty: boolean;
}

interface CsvTable {
  headers: string[];
  rows: Array<Array<string | number>>;
}

function buildCsvTable(
  type: ReportType,
  metricsRows: DailyMetricRow[],
  placementRows: PlacementTrendPoint[],
): CsvTable {
  // Engagement / warmth / white-label all draw from DailyMetricRow. Placement
  // uses the dedicated placement trend series. Columns mirror the headline
  // numbers the cover preview shows so the user can spot-check.
  if (type === 'placement') {
    return {
      headers: ['date', 'inbox_pct', 'promotions_pct', 'spam_pct'],
      rows: placementRows
        .slice(-5)
        .map((p) => [p.date, p.inbox_pct, p.promotions_pct, p.spam_pct]),
    };
  }
  if (type === 'engagement') {
    return {
      headers: ['date', 'sent', 'opened', 'replied', 'open_rate'],
      rows: metricsRows
        .slice(-5)
        .map((r) => [
          r.date,
          r.sent,
          r.opened,
          r.replied,
          r.sent ? Math.round((r.opened / r.sent) * 100) : 0,
        ]),
    };
  }
  // warmth + white_label — warmth score series is the most readable summary.
  return {
    headers: ['date', 'sent', 'delivered', 'bounced', 'warmth_score'],
    rows: metricsRows
      .slice(-5)
      .map((r) => [r.date, r.sent, r.delivered, r.bounced, r.warmth_score]),
  };
}

function CsvPreview({
  type,
  tone,
  label,
  rangeLabel,
  mailboxCount,
  metricsRows,
  placementRows,
  loading,
  empty,
}: CsvPreviewProps) {
  const table = useMemo(
    () => buildCsvTable(type, metricsRows, placementRows),
    [type, metricsRows, placementRows],
  );

  return (
    <div
      className={`r2__cover r2__cover--${tone}`}
      style={{
        aspectRatio: 'auto',
        background: 'var(--wp-surface)',
        color: 'var(--wp-text)',
      }}
    >
      <div className="r2__cover-band">
        <span className="r2__cover-eyebrow">WARMPULSE · CSV PREVIEW</span>
        <h3 className="r2__cover-title">{label}.csv</h3>
        <span className="r2__cover-meta">
          {rangeLabel} · {mailboxCount} mailbox{mailboxCount === 1 ? '' : 'es'}
        </span>
      </div>

      <div
        style={{
          padding: '18px 24px 14px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: 'var(--wp-text)',
        }}
      >
        {loading ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--wp-text-faint)',
              padding: '24px 0',
              textAlign: 'center',
              fontFamily: 'inherit',
            }}
          >
            Loading preview…
          </div>
        ) : empty || table.rows.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--wp-text-faint)',
              padding: '24px 0',
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            No data in this range yet — the CSV export will be empty (header
            row only) until warmup activity is recorded.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 11,
              }}
            >
              <thead>
                <tr>
                  {table.headers.map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '6px 8px',
                        borderBottom: '1px solid var(--wp-border)',
                        color: 'var(--wp-text-dim)',
                        fontWeight: 600,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: '5px 8px',
                          borderBottom:
                            ri === table.rows.length - 1
                              ? 'none'
                              : '1px solid var(--wp-border-muted, var(--wp-border))',
                          color: 'var(--wp-text)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <footer className="r2__cover-foot">
        <span>WarmPulse · {formatDate(new Date())}</span>
        <span>
          {table.rows.length} sample row{table.rows.length === 1 ? '' : 's'}
        </span>
      </footer>
    </div>
  );
}

function RecentlyGenerated({
  items,
  onDownload,
  loading,
}: {
  items: GeneratedReport[];
  onDownload: (r: GeneratedReport) => void;
  loading: boolean;
}) {
  return (
    <section
      style={{
        width: '100%',
        maxWidth: 480,
        marginTop: 18,
        padding: 14,
        borderRadius: 12,
        border: '1px solid var(--wp-border)',
        background: 'var(--wp-surface-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          className="r2-eyebrow"
          style={{ color: 'var(--wp-text-dim)' }}
        >
          <FileText size={11} strokeWidth={2.4} />
          Recently generated
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: 'var(--wp-text-faint)',
          }}
        >
          {items.length === 0 ? 'none yet' : `last ${items.length}`}
        </span>
      </header>

      {loading ? (
        <div style={{ fontSize: 11, color: 'var(--wp-text-faint)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div
          style={{
            fontSize: 11,
            color: 'var(--wp-text-faint)',
            fontStyle: 'italic',
            padding: '4px 0',
          }}
        >
          Nothing yet — generate your first report above.
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {items.map((r) => {
            const tone = REPORT_TYPE_META[r.type]?.tone ?? 'violet';
            const TypeIcon = REPORT_TYPE_META[r.type]?.Icon ?? FileText;
            return (
              <li
                key={r.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr auto',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--wp-border)',
                  background: 'var(--wp-surface)',
                }}
              >
                <span
                  className={`r2__type-icon r2__type-icon--${tone}`}
                  style={{ width: 24, height: 24 }}
                  aria-hidden
                >
                  <TypeIcon size={12} strokeWidth={2.4} />
                </span>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--wp-text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {(REPORT_TYPE_META[r.type]?.label ?? r.type)} · {r.format.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--wp-text-faint)' }}>
                    {r.range} · {relTime(r.created_at)}
                    {formatBytes((r as unknown as { size_bytes?: number }).size_bytes)
                      ? ` · ${formatBytes((r as unknown as { size_bytes?: number }).size_bytes)}`
                      : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onDownload(r)}
                  className="r2-btn r2-btn--ghost"
                  style={{
                    flex: 'none',
                    padding: '6px 12px',
                    fontSize: 11,
                  }}
                >
                  <Download size={11} strokeWidth={2.4} />
                  Download
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default ProReports;
