import { useMemo, useState } from 'react';
import { Download, Eye, FileText, Loader2, Trash2 } from 'lucide-react';
import { ReportPreviewDialog } from './ReportPreviewDialog';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import { extractErrorMessage } from '@/lib/errors';
import { formatDateTime as _formatDateTime } from '@/lib/format';
import {
  useDeleteReport,
  useDownloadReport,
  useReports,
  type GeneratedReport,
  type ReportType,
} from './api';

const PAGE_SIZE = 10;

const TYPE_VARIANT: Record<ReportType, BadgeVariant> = {
  warmth: 'green',
  engagement: 'blue',
  placement: 'yellow',
  white_label: 'orange',
};

const TYPE_LABEL: Record<ReportType, string> = {
  warmth: 'Warmth',
  engagement: 'Opens & Replies',
  placement: 'Where Emails Land',
  white_label: 'White-label',
};

export function ReportsTable() {
  const { data, isLoading, isError } = useReports();
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<GeneratedReport | null>(null);

  const generated = data?.generated ?? [];
  const pageCount = Math.max(1, Math.ceil(generated.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => generated.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [generated, safePage],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" /> Generated reports
        </CardTitle>
        <CardDescription>Download or delete reports you've already generated.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-5">
            <EmptyState
              title="Couldn't load reports"
              description="Try refreshing. If the issue persists, contact support."
            />
          </div>
        ) : generated.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title="No reports yet"
              description="Generate your first report to see it here."
            />
          </div>
        ) : (
          <>
            <Rows rows={pageRows} onPreview={setPreview} />
            {pageCount > 1 ? (
              <div className="flex items-center justify-between border-t border-border-muted p-3 text-xs text-text-dim">
                <span>
                  Page {safePage} of {pageCount} • {generated.length} reports
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={safePage >= pageCount}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
      <ReportPreviewDialog report={preview} onClose={() => setPreview(null)} />
    </Card>
  );
}

function Rows({
  rows,
  onPreview,
}: {
  rows: GeneratedReport[];
  onPreview: (r: GeneratedReport) => void;
}) {
  const download = useDownloadReport();
  const remove = useDeleteReport();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="bg-surface-2/50">
          <tr className="text-left text-xs font-medium uppercase tracking-wider text-text-dim">
            <th className="px-4 py-2">Created</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Range</th>
            <th className="px-4 py-2">Format</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {rows.map((r) => (
            <tr key={r.id} className="text-sm">
              <td className="px-4 py-2 tabular-nums text-text-dim">
                {fmtDateTime(r.created_at)}
              </td>
              <td className="px-4 py-2">
                <Badge variant={TYPE_VARIANT[r.type]}>{TYPE_LABEL[r.type]}</Badge>
              </td>
              <td className="px-4 py-2 text-text-dim">{r.range}</td>
              <td className="px-4 py-2">
                <Badge variant="neutral">{r.format.toUpperCase()}</Badge>
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onPreview(r)}
                    leftIcon={<Eye className="h-3.5 w-3.5" />}
                    aria-label="View report"
                  >
                    View
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      download.mutate(r, {
                        onSuccess: () => toast.success('Download started'),
                        onError: () => toast.error('Failed to download'),
                      })
                    }
                    disabled={download.isPending}
                    leftIcon={
                      download.isPending && download.variables?.id === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )
                    }
                  >
                    Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete report?',
                        description: 'The downloadable file will also be removed. This cannot be undone.',
                        confirmLabel: 'Delete',
                        danger: true,
                      });
                      if (!ok) return;
                      remove.mutate(r.id, {
                        onSuccess: () => toast.success('Report deleted'),
                        onError: (err) =>
                          toast.error(extractErrorMessage(err, 'Failed to delete')),
                      });
                    }}
                    aria-label="Delete report"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtDateTime(iso: string): string {
  try {
    return _formatDateTime(iso);
  } catch {
    return iso;
  }
}
