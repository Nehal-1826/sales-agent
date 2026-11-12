import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  AppDialog,
  AppDialogContent,
  AppDialogTrigger,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogDescription,
  AppDialogBody,
  AppDialogFooter,
  AppDialogStepper,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/AppToast';
import {
  useBulkImportPeerInboxes,
  type BulkImportResult,
} from '@/features/admin/api';

interface BulkImportDialogProps {
  trigger: ReactNode;
}

export function BulkImportDialog({ trigger }: BulkImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const bulk = useBulkImportPeerInboxes();

  async function submit() {
    if (!file) {
      toast.error('Pick a CSV file first.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await bulk.mutateAsync(form);
      setResult(res);
      toast.success(`Imported ${res.created} inboxes.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk import failed.');
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setResult(null);
      }}
    >
      <AppDialogTrigger asChild>{trigger}</AppDialogTrigger>
      <AppDialogContent>
        {/* Three-phase wizard: pick CSV → upload → result. The stepper
            reflects the current state (file picked? upload done?) so the
            admin sees where they are in the flow. */}
        <AppDialogStepper
          steps={['Pick CSV', 'Upload', 'Result']}
          current={result ? 2 : file ? 1 : 0}
        />
        <AppDialogHeader>
          <AppDialogTitle>Bulk import test accounts</AppDialogTitle>
          <AppDialogDescription>
            CSV columns: <span className="font-mono text-text">email, provider, daily_capacity,
            smtp_host, smtp_port, smtp_username, smtp_password</span>.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody>
          <FormField label="CSV file" required>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </FormField>
          {result ? (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <Badge variant="green">Created {result.created}</Badge>
                <Badge variant="orange">Failed {result.failed}</Badge>
              </div>
              {result.errors.length > 0 ? (
                <div className="max-h-48 overflow-auto rounded-md border border-border-muted bg-surface-2/40 p-2 text-xs">
                  {result.errors.map((e, i) => (
                    <div key={i} className="py-0.5">
                      <span className="text-text-dim">row {e.row}</span>{' '}
                      <span className="text-text">{e.email}</span>{' '}
                      <span className="text-accent3">{e.error}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button disabled={bulk.isPending || !file} onClick={submit}>
            {bulk.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
