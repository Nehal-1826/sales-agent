import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { AxiosError } from 'axios';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/AppToast';
import { api } from '@/lib/api';
import type { AuditFilters } from '@/features/admin/types';

interface ExportCsvButtonProps {
  /** Optional filters to forward as query params on the export endpoint. */
  filters?: AuditFilters;
  className?: string;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so browsers that chain reads synchronously finish.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function filenameFor(): string {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10);
  return `audit-log-${iso}.csv`;
}

/**
 * One-shot "download CSV" button for the audit log.
 *
 * Hits the dedicated export endpoint as a blob, turns it into a download,
 * and surfaces a toast on success/failure. Soft-fails on 404/501 with a
 * friendly "not available yet" message rather than a red error.
 */
export function ExportCsvButton({ filters, className }: ExportCsvButtonProps) {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      const res = await api.get('/admin/audit-log/export.csv', {
        params: filters,
        responseType: 'blob',
      });
      const blob = res.data as Blob;
      if (!blob || (blob.size === 0 && !res.headers['content-type']?.toString().includes('csv'))) {
        toast.error('Export returned no data');
        return;
      }
      triggerDownload(blob, filenameFor());
      toast.success('CSV download started');
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : null;
      if (status === 404 || status === 501 || status === 503) {
        toast.error('CSV export is not available yet');
      } else {
        toast.error('Failed to export audit log');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      className={className}
      leftIcon={
        pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )
      }
    >
      {pending ? 'Exporting…' : 'Export CSV'}
    </Button>
  );
}
