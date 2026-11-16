import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Crown,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  RefreshCcw,
  Sparkles,
  Target,
  Trash2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { confirm } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/AppToast';
import { GenerateReportDialog } from '@/features/reports/GenerateReportDialog';
import { ScheduleDialog } from '@/features/reports/ScheduledReportsPanel';
import {
  useDeleteReport,
  useDownloadReport,
  useReports,
  type GeneratedReport,
  type ReportFormat,
  type ReportType,
  type ReportsVolumePoint,
} from '@/features/reports/api';
import './starter-reports.css';
import { formatDate, formatDateTime } from '@/lib/format';

/**
 * /app/reports — STARTER tier (R4 Cover Strip).
 *
 * Layout:
 *   ┌─ Heading + filter chips + Refresh ────────────┐
 *   ├─ Horizontal cover strip ──────────────────────┤
 *   │   [Cover · PDF]  [Cover · CSV]  [Cover]  …    │
 *   ├─ CTA cards ───────────────────────────────────┤
 *   │  Schedule weekly digest   |   Generate ad-hoc │
 *   └───────────────────────────────────────────────┘
 *
 * Data:
 *   useReports() → generated[], scheduled[], volume_series[]
 *   useDownloadReport()  → triggers a browser file save
 *   useDeleteReport()    → removes the row + toast
 *
 * Each cover gets a hand-rolled mini bar chart sourced from
 * `volume_series` so the strip stays visual even when only one report
 * has been generated.
 */

type FilterKey = 'all' | 'pdf' | 'csv';

const TYPE_META: Record<ReportType, { label: string; tone: 'violet' | 'cyan' | 'green' | 'yellow'; Icon: typeof BarChart3 }> = {
  warmth: { label: 'Warmth', tone: 'violet', Icon: Sparkles },
  engagement: { label: 'Opens & Replies', tone: 'cyan', Icon: BarChart3 },
  placement: { label: 'Where Emails Land', tone: 'green', Icon: Target },
  white_label: { label: 'White-label', tone: 'yellow', Icon: Crown },
};

const FORMAT_META: Record<ReportFormat, { label: string; Icon: typeof FileText }> = {
  pdf: { label: 'PDF', Icon: FileText },
  csv: { label: 'CSV', Icon: FileSpreadsheet },
};

export function StarterReports() {
  const reports = useReports();
  const download = useDownloadReport();
  const remove = useDeleteReport();
  const [genOpen, setGenOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const generated = reports.data?.generated ?? [];
  const volumeSeries = reports.data?.volume_series ?? [];

  const filtered = useMemo(() => {
    if (filter === 'all') return generated;
    return generated.filter((r) => r.format === filter);
  }, [generated, filter]);

  const counts = useMemo(
    () => ({
      all: generated.length,
      pdf: generated.filter((r) => r.format === 'pdf').length,
      csv: generated.filter((r) => r.format === 'csv').length,
    }),
    [generated],
  );

  // Sparkline series per report — use the matching tail of volume_series so
  // the bars carry real (if approximate) signal rather than being decorative.
  const sparkFor = (report: GeneratedReport): number[] => {
    const tail = volumeSeries.slice(-12);
    if (tail.length === 0) return [];
    return tail.map((p) =>
      report.format === 'pdf' ? Number(p.pdfs ?? 0) : Number(p.csvs ?? 0),
    );
  };

  const handleDownload = (r: GeneratedReport) => {
    download.mutate(r, {
      onError: () => toast.error('Download failed.'),
    });
  };

  const handleDelete = async (r: GeneratedReport) => {
    const ok = await confirm({
      title: `Delete ${TYPE_META[r.type]?.label ?? r.type} report?`,
      description: `Generated ${formatRelTime(r.created_at)} · ${r.format.toUpperCase()}. This can't be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    remove.mutate(r.id, {
      onSuccess: () => toast.success('Report removed.'),
      onError: () => toast.error('Could not delete.'),
    });
  };

  return (
    <div className="rp">
      {/* ----- Header ----- */}
      <motion.header
        className="rp__head"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
      >
        <div className="rp__head-text">
          <span className="rp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            Editorial reports
          </span>
          <h1 className="rp__title">Reports</h1>
          <p className="rp__sub">
            PDF and CSV exports of your warmup activity. Click a cover to download, or
            generate a fresh one below.
          </p>
          <span className="rp__head-stats">
            <span className="rp__head-stat">
              <FileText size={11} strokeWidth={2.4} />
              {counts.pdf} {counts.pdf === 1 ? 'PDF' : 'PDFs'}
            </span>
            <span className="rp__head-stat-sep">·</span>
            <span className="rp__head-stat">
              <FileSpreadsheet size={11} strokeWidth={2.4} />
              {counts.csv} {counts.csv === 1 ? 'CSV' : 'CSVs'}
            </span>
          </span>
        </div>
        <div className="rp__head-actions">
          <div className="rp__filters" role="tablist" aria-label="Filter reports by format">
            <FilterChip
              label="All"
              count={counts.all}
              active={filter === 'all'}
              onClick={() => setFilter('all')}
            />
            <FilterChip
              label="PDF"
              count={counts.pdf}
              active={filter === 'pdf'}
              onClick={() => setFilter('pdf')}
            />
            <FilterChip
              label="CSV"
              count={counts.csv}
              active={filter === 'csv'}
              onClick={() => setFilter('csv')}
            />
          </div>
          <div className="rp__head-buttons">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => reports.refetch()}
              disabled={reports.isFetching}
              leftIcon={
                reports.isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" />
                )
              }
            >
              {reports.isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setGenOpen(true)}
              leftIcon={<Zap className="h-3.5 w-3.5" />}
            >
              Generate report
            </Button>
          </div>
        </div>
      </motion.header>

      {/* ----- Cover strip ----- */}
      {reports.isLoading ? (
        <div className="rp-strip">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCover key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyCoverStrip
          hasAny={generated.length > 0}
          filter={filter}
          onGenerate={() => setGenOpen(true)}
        />
      ) : (
        <div className="rp-strip">
          {filtered.map((r, idx) => (
            <ReportCover
              key={r.id}
              report={r}
              series={sparkFor(r)}
              idx={idx}
              onDownload={() => handleDownload(r)}
              onDelete={() => handleDelete(r)}
              isDownloading={download.isPending}
            />
          ))}
        </div>
      )}

      {/* ----- CTA cards ----- */}
      <div className="rp-cta">
        <CtaCard
          idx={0}
          Icon={CalendarClock}
          tone="cyan"
          title="Schedule a weekly digest"
          desc="A fresh warmth + opens & replies summary lands every Monday in your inbox. Set recipients once, never think about it again."
          action="Set up schedule"
          onClick={() => setScheduleOpen(true)}
        />
        <CtaCard
          idx={1}
          Icon={Zap}
          tone="violet"
          title="Generate one-off report"
          desc="Pick a date range and a report type. PDF for sharing with stakeholders, CSV for crunching the numbers yourself."
          action="Generate now"
          onClick={() => setGenOpen(true)}
        />
      </div>

      <GenerateReportDialog open={genOpen} onOpenChange={setGenOpen} />
      <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} mode="create" />
    </div>
  );
}

/* ============================================================================
   Filter chip
============================================================================ */
function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`rp-chip ${active ? 'rp-chip--active' : ''}`}
      onClick={onClick}
    >
      {label}
      <span className="rp-chip__count">{count}</span>
    </button>
  );
}

/* ============================================================================
   Report cover — single tile on the strip
============================================================================ */
function ReportCover({
  report,
  series,
  idx,
  onDownload,
  onDelete,
  isDownloading,
}: {
  report: GeneratedReport;
  series: number[];
  idx: number;
  onDownload: () => void;
  onDelete: () => void;
  isDownloading: boolean;
}) {
  const meta = TYPE_META[report.type] ?? TYPE_META.warmth;
  const fmt = FORMAT_META[report.format] ?? FORMAT_META.pdf;
  const TypeIcon = meta.Icon;
  const FmtIcon = fmt.Icon;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: idx * 0.05 }}
      className={`rp-cover rp-cover--${meta.tone}`}
    >
      {/* Type pill anchored top-left */}
      <header className="rp-cover__head">
        <span className={`rp-cover__pill rp-cover__pill--${meta.tone}`}>
          <TypeIcon size={11} strokeWidth={2.4} />
          {meta.label}
        </span>
        <span className={`rp-cover__fmt rp-cover__fmt--${report.format}`}>
          <FmtIcon size={10} strokeWidth={2.4} />
          {fmt.label}
        </span>
      </header>

      {/* Title + range */}
      <div className="rp-cover__body">
        <h3 className="rp-cover__title">{meta.label} report</h3>
        <p className="rp-cover__range">{report.range || 'Last 30 days'}</p>

        {/* Mini sparkline bars — synthesized from the matching format series */}
        <div className="rp-cover__chart">
          <MiniBars data={series} tone={meta.tone} />
        </div>
      </div>

      {/* Footer with date + actions */}
      <footer className="rp-cover__foot">
        <span className="rp-cover__date" title={formatDateTime(report.created_at)}>
          {formatRelTime(report.created_at)}
        </span>
        <div className="rp-cover__actions">
          <button
            type="button"
            className="rp-cover__act rp-cover__act--ghost"
            onClick={onDelete}
            aria-label={`Delete ${meta.label} report`}
            title="Delete"
          >
            <Trash2 size={12} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            className={`rp-cover__act rp-cover__act--primary rp-cover__act--${meta.tone}`}
            onClick={onDownload}
            disabled={isDownloading}
            aria-label={`Download ${meta.label} report as ${fmt.label}`}
            title={isDownloading ? 'Downloading…' : `Download ${fmt.label}`}
          >
            {isDownloading ? (
              <Loader2 size={12} strokeWidth={2.4} className="animate-spin" />
            ) : (
              <Download size={12} strokeWidth={2.4} />
            )}
            {isDownloading ? 'Downloading…' : 'Download'}
          </button>
        </div>
      </footer>
    </motion.article>
  );
}

/* ============================================================================
   Mini bars — small SVG column chart for the cover preview
============================================================================ */
const TONE_COLOR: Record<string, string> = {
  violet: 'rgb(255, 150, 112)',
  cyan: 'rgb(255, 138, 75)',
  green: 'rgb(242, 101, 34)',
  yellow: 'rgb(255, 213, 79)',
  red: 'rgb(255, 107, 74)',
};

function MiniBars({ data, tone }: { data: number[]; tone: string }) {
  const W = 220;
  const H = 60;
  const PAD = 2;
  const color = TONE_COLOR[tone] ?? TONE_COLOR.violet!;

  // If we have no data, show 12 ghost bars at varying heights so the cover
  // still looks magazine-like.
  const series = data.length > 0 ? data : Array.from({ length: 12 }).map((_, i) =>
    8 + ((Math.sin(i * 0.6) + 1) * 12),
  );

  const max = Math.max(1, ...series);
  const gap = 2;
  const barW = (W - PAD * 2 - gap * (series.length - 1)) / series.length;
  const isGhost = data.length === 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="rp-cover__svg">
      {series.map((v, i) => {
        const h = Math.max(2, (v / max) * (H - PAD * 2));
        const x = PAD + i * (barW + gap);
        const y = H - PAD - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={Math.min(2, barW / 2)}
            fill={isGhost ? 'rgb(42, 42, 58)' : color}
            opacity={isGhost ? 0.6 : 0.88}
          />
        );
      })}
    </svg>
  );
}

/* ============================================================================
   Skeleton cover
============================================================================ */
function SkeletonCover() {
  return (
    <div className="rp-cover rp-cover--skeleton" aria-busy="true">
      <header className="rp-cover__head">
        <span className="rp-skel rp-skel--w-16" />
        <span className="rp-skel rp-skel--w-10" />
      </header>
      <div className="rp-cover__body">
        <span className="rp-skel rp-skel--w-32" />
        <span className="rp-skel rp-skel--w-24" />
        <div className="rp-cover__chart">
          <span className="rp-skel rp-skel--block" />
        </div>
      </div>
      <footer className="rp-cover__foot">
        <span className="rp-skel rp-skel--w-12" />
        <span className="rp-skel rp-skel--w-20" />
      </footer>
    </div>
  );
}

/* ============================================================================
   Empty cover strip
============================================================================ */
function EmptyCoverStrip({
  hasAny,
  filter,
  onGenerate,
}: {
  hasAny: boolean;
  filter: FilterKey;
  onGenerate: () => void;
}) {
  // Two distinct cases: no reports at all, or no reports for the filter.
  if (hasAny) {
    return (
      <motion.div
        className="rp-empty rp-empty--filter"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <p className="rp-empty__title">No {filter.toUpperCase()} reports yet</p>
        <p className="rp-empty__sub">
          Try a different filter, or generate a fresh one in the format you need.
        </p>
        <Button
          onClick={onGenerate}
          variant="secondary"
          size="sm"
          leftIcon={<Zap className="h-3.5 w-3.5" />}
        >
          Generate {filter.toUpperCase()} report
        </Button>
      </motion.div>
    );
  }
  return (
    <motion.div
      className="rp-empty"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
    >
      <div className="rp-empty__icon">
        <Mail size={20} strokeWidth={2} />
      </div>
      <p className="rp-empty__title">No reports generated yet</p>
      <p className="rp-empty__sub">
        Generate your first report below — pick a date range, a report type, and a format.
      </p>
      <Button onClick={onGenerate} leftIcon={<Zap className="h-4 w-4" />}>
        Generate first report
      </Button>
    </motion.div>
  );
}

/* ============================================================================
   CTA card
============================================================================ */
function CtaCard({
  idx,
  Icon,
  tone,
  title,
  desc,
  action,
  onClick,
}: {
  idx: number;
  Icon: typeof Zap;
  tone: 'violet' | 'cyan' | 'green' | 'yellow';
  title: string;
  desc: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`rp-cta-card rp-cta-card--${tone}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: 0.08 + idx * 0.06, ease: 'easeOut' }}
    >
      <span className={`rp-cta-card__icon rp-cta-card__icon--${tone}`}>
        <Icon size={16} strokeWidth={2.2} />
      </span>
      <div className="rp-cta-card__body">
        <span className="rp-cta-card__title">{title}</span>
        <span className="rp-cta-card__desc">{desc}</span>
      </div>
      <span className={`rp-cta-card__action rp-cta-card__action--${tone}`}>
        {action}
        <ArrowRight size={12} strokeWidth={2.4} />
      </span>
    </motion.button>
  );
}

/* ============================================================================
   Helpers
============================================================================ */
function formatRelTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(d);
}

// Re-export type aliases used in this file so tree-shaking doesn't accidentally
// drop the GenerateReportDialog import.
export type { ReportsVolumePoint };

export default StarterReports;
