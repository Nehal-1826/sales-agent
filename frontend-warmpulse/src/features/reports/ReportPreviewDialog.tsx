import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  Printer,
  RotateCw,
  X,
} from 'lucide-react';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/AppToast';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { useDownloadReport, type GeneratedReport } from './api';

interface ReportPreviewDialogProps {
  report: GeneratedReport | null;
  onClose: () => void;
}

interface BlobState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  url: string | null;
  text: string | null;
  error: string | null;
  size: number;
}

const INITIAL: BlobState = {
  status: 'idle', url: null, text: null, error: null, size: 0,
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Modal preview for generated reports.
 *
 * PDF → object/iframe embed of the blob URL (browser's native viewer).
 * CSV → parse the text and render a sticky-header HTML table.
 *
 * The blob is fetched once when `report` becomes non-null and revoked on
 * close so we don't leak object URLs across previews.
 */
export function ReportPreviewDialog({ report, onClose }: ReportPreviewDialogProps) {
  const [state, setState] = useState<BlobState>(INITIAL);
  const [fullscreen, setFullscreen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const download = useDownloadReport();

  useEffect(() => {
    if (!report) {
      setState(INITIAL);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      setState({ status: 'loading', url: null, text: null, error: null, size: 0 });
      try {
        const isAbsolute = /^https?:\/\//i.test(report.download_url);
        let blob: Blob;
        let text: string | null = null;
        if (isAbsolute) {
          const r = await fetch(report.download_url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          blob = await r.blob();
        } else {
          const res = await api.get(report.download_url, { responseType: 'blob' });
          blob = res.data as Blob;
        }
        if (report.format === 'csv') {
          text = await blob.text();
        }
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setState({
          status: 'ready', url: createdUrl, text,
          error: null, size: blob.size,
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load preview';
        setState({ status: 'error', url: null, text: null, error: msg, size: 0 });
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [report, reloadTick]);

  // Reset fullscreen when the dialog closes so the next open starts compact.
  useEffect(() => {
    if (!report) setFullscreen(false);
  }, [report]);

  const open = report !== null;
  const title = useMemo(() => {
    if (!report) return '';
    return `${typeLabel(report.type)} report`;
  }, [report]);

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      toast.info('Open the file first, then print.');
      return;
    }
    try {
      win.focus();
      win.print();
    } catch {
      toast.error('Printing is blocked by the browser. Open in a new tab instead.');
    }
  };

  const handleOpenTab = () => {
    if (state.url) window.open(state.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <AppDialogContent
        className={cn(
          'flex flex-col p-0',
          fullscreen
            ? 'h-[100dvh] w-[100vw] max-h-none max-w-none rounded-none'
            : 'h-[90vh] max-h-[920px] w-[95vw] max-w-5xl',
        )}
        showClose={false}
      >
        <AppDialogTitle className="sr-only">{title}</AppDialogTitle>
        <AppDialogDescription className="sr-only">
          {report
            ? `Preview ${report.format.toUpperCase()} report covering ${report.range}.`
            : 'Report preview.'}
        </AppDialogDescription>

        <header className="flex items-center justify-between gap-3 border-b border-border-muted px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            {report ? (
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-dim">
                <Badge variant="neutral">{report.format.toUpperCase()}</Badge>
                <span>{report.range}</span>
                <span>·</span>
                <span>{formatDateTime(report.created_at)}</span>
                {state.status === 'ready' ? (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">{fmtBytes(state.size)}</span>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {report?.format === 'pdf' && state.status === 'ready' ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrint}
                aria-label="Print"
                title="Print"
              >
                <Printer className="h-4 w-4" />
              </Button>
            ) : null}
            {state.status === 'ready' ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleOpenTab}
                aria-label="Open in new tab"
                title="Open in a new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFullscreen((v) => !v)}
              aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Download className="h-3.5 w-3.5" />}
              disabled={!report || download.isPending}
              onClick={() =>
                report &&
                download.mutate(report, {
                  onSuccess: () => toast.success('Download started'),
                  onError: () => toast.error('Failed to download'),
                })
              }
            >
              Download
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1" data-lenis-prevent>
          {state.status === 'loading' || state.status === 'idle' ? (
            <div className="flex h-full items-center justify-center text-sm text-text-dim">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading preview…
            </div>
          ) : state.status === 'error' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
              <EmptyState
                title="Couldn't load this report"
                description={state.error ?? 'Try downloading the file instead.'}
              />
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RotateCw className="h-3.5 w-3.5" />}
                onClick={() => setReloadTick((t) => t + 1)}
              >
                Retry
              </Button>
            </div>
          ) : report?.format === 'pdf' && state.url ? (
            // <object> falls back gracefully if the browser can't render
            // the PDF inline (Safari iOS, certain locked-down configs).
            // We also keep an iframe ref so the Print button can call
            // contentWindow.print() directly.
            <object
              data={state.url}
              type="application/pdf"
              className="h-full w-full"
              aria-label={title}
            >
              <iframe
                ref={iframeRef}
                src={state.url}
                title={title}
                className="h-full w-full border-0"
              />
            </object>
          ) : report?.format === 'csv' && state.text !== null ? (
            <CsvTable text={state.text} />
          ) : null}
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}

// --------------------------- CSV table --------------------------- //

interface CsvTableProps {
  text: string;
}

/**
 * Lightweight CSV → HTML table. Handles quoted fields with embedded commas
 * and escaped double-quotes (RFC 4180). Doesn't try to be smart about
 * type-coercing numbers — keep it readable; downloads still get the
 * untouched file.
 */
function CsvTable({ text }: CsvTableProps) {
  const rows = useMemo(() => parseCsv(text), [text]);
  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState title="Empty CSV" description="The file has no rows to display." />
      </div>
    );
  }
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr>
            {header.map((h, i) => (
              <th
                key={i}
                className={cn(
                  'border-b border-border-muted px-3 py-2 text-left',
                  'text-xs font-semibold uppercase tracking-wider text-text-dim',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr
              key={i}
              className={cn(
                'border-b border-border-muted/60',
                i % 2 === 0 ? 'bg-bg' : 'bg-surface-2/30',
              )}
            >
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 align-top tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseCsv(input: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      // CRLF: skip the LF that follows a CR.
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      // Skip blank trailing lines.
      if (row.length > 1 || row[0] !== '') out.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Flush trailing field/row.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') out.push(row);
  }
  return out;
}

function typeLabel(t: GeneratedReport['type']): string {
  switch (t) {
    case 'warmth':
      return 'Warmth';
    case 'engagement':
      return 'Engagement';
    case 'placement':
      return 'Placement';
    case 'white_label':
      return 'White-label';
  }
}
