/**
 * Reusable "Export report" button for admin sections. Exports the supplied
 * rows to CSV client-side via lib/exportCsv. Generic over the row type — each
 * page passes its own column spec.
 *
 * Usage:
 *   <ExportButton
 *     rows={users}
 *     columns={[{ header: 'Email', value: (u) => u.email }, ...]}
 *     filename={`users-${exportStamp()}`}
 *   />
 */
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/AppToast';
import { exportRowsToCsv, type CsvColumn } from '@/lib/exportCsv';

interface ExportButtonProps<T> {
  rows: T[];
  columns: CsvColumn<T>[];
  filename: string;
  label?: string;
  disabled?: boolean;
}

export function ExportButton<T>({
  rows,
  columns,
  filename,
  label = 'Export report',
  disabled,
}: ExportButtonProps<T>) {
  const handle = () => {
    if (!rows.length) {
      toast.error('Nothing to export yet.');
      return;
    }
    const n = exportRowsToCsv(filename, rows, columns);
    toast.success(`Exported ${n} row${n === 1 ? '' : 's'} to CSV.`);
  };

  return (
    <Button
      variant="secondary"
      leftIcon={<Download className="h-4 w-4" />}
      onClick={handle}
      disabled={disabled || rows.length === 0}
    >
      {label}
    </Button>
  );
}
