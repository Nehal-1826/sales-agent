import { useRef, useState } from 'react';
import { FileUp, Linkedin, Loader2, Table2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { toast } from '@/components/ui/AppToast';
import { cn } from '@/lib/cn';
import { useImportLeads, extractCrmError } from '../api';

type ImportSource = 'csv' | 'linkedin';

const SOURCE_META: Record<
  ImportSource,
  { header: string; hint: string; placeholder: string }
> = {
  csv: {
    header: 'name,email,company,title,phone,value',
    hint: 'The first row should be the header. Rows missing a valid email are skipped.',
    placeholder:
      'name,email,company,title,phone,value\nJane Cooper,jane@acme.com,Acme Inc.,VP Sales,+1 555 0100,2500',
  },
  linkedin: {
    header: 'First Name,Last Name,Email Address,Company,Position,URL',
    hint: 'Upload the Connections.csv from LinkedIn ▸ Settings ▸ Get a copy of your data ▸ Connections. The export preamble is handled automatically; rows without an email still import (LinkedIn often hides it).',
    placeholder:
      'First Name,Last Name,Email Address,Company,Position,Connected On,URL\nJane,Cooper,jane@acme.com,Acme Inc.,VP Sales,01 Jan 2026,https://linkedin.com/in/janecooper',
  },
};

export interface CsvImportDialogProps {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Lead import dialog with two modes:
 *   - CSV: generic `name,email,company,title,phone,value` header.
 *   - LinkedIn: the official LinkedIn connections export (Connections.csv),
 *     mapped server-side (First/Last Name → name, Position → title, URL → notes,
 *     tagged `linkedin`).
 *
 * Accepts a pasted blob OR a chosen `.csv` file, then POSTs to
 * `/crm/leads/import` with the selected `source`.
 */
export function CsvImportDialog({ campaignId, open, onOpenChange }: CsvImportDialogProps) {
  const importLeads = useImportLeads();
  const [source, setSource] = useState<ImportSource>('csv');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const meta = SOURCE_META[source];

  const close = (v: boolean) => {
    if (!v) {
      setCsv('');
      setFileName(null);
      setSource('csv');
      importLeads.reset();
      if (fileRef.current) fileRef.current.value = '';
    }
    onOpenChange(v);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      setCsv(text);
      setFileName(file.name);
    } catch {
      toast.error('Could not read that file');
    }
  };

  const onSubmit = () => {
    const trimmed = csv.trim();
    if (!trimmed) {
      toast.error('Paste data or choose a file first');
      return;
    }
    importLeads.mutate(
      { campaign_id: campaignId, csv: trimmed, source },
      {
        onSuccess: (res) => {
          toast.success(`Imported ${res.imported} · skipped ${res.skipped}`);
          close(false);
        },
        onError: (err) => toast.error(extractCrmError(err, 'Import failed')),
      },
    );
  };

  return (
    <AppDialog open={open} onOpenChange={close}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Import leads</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          {/* Source toggle */}
          <div className="inline-flex w-full items-center gap-1 rounded-xl border border-border-muted bg-surface-2/40 p-1">
            <SourceTab
              active={source === 'csv'}
              onClick={() => setSource('csv')}
              icon={<Table2 className="h-4 w-4" strokeWidth={2.2} />}
              label="CSV file"
            />
            <SourceTab
              active={source === 'linkedin'}
              onClick={() => setSource('linkedin')}
              icon={<Linkedin className="h-4 w-4" strokeWidth={2.2} />}
              label="LinkedIn export"
            />
          </div>

          <div className="rounded-lg border border-border-muted bg-surface-2/40 p-3 text-xs text-text-dim">
            Expected header:
            <code className="ml-1.5 rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-accent">
              {meta.header}
            </code>
            <p className="mt-1.5 text-text-faint">{meta.hint}</p>
          </div>

          {/* File input */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => fileRef.current?.click()}
              leftIcon={<FileUp className="h-4 w-4" />}
            >
              {fileName ? `Selected: ${fileName}` : 'Choose .csv file'}
            </Button>
          </div>

          <FormField label="…or paste the data" htmlFor="csv-text">
            <textarea
              id="csv-text"
              rows={8}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                if (fileName) setFileName(null);
              }}
              placeholder={meta.placeholder}
              className="flex w-full rounded-lg border border-border-muted bg-surface px-3 py-2 font-mono text-xs text-text placeholder:text-text-faint focus-ring focus:border-accent"
              style={{ resize: 'vertical' }}
            />
          </FormField>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" type="button" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={importLeads.isPending || !csv.trim()}
            leftIcon={
              importLeads.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )
            }
          >
            {importLeads.isPending ? 'Importing…' : 'Import'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function SourceTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-surface text-text shadow-sm'
          : 'text-text-dim hover:text-text',
      )}
      style={
        active
          ? { border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 40%, transparent)' }
          : undefined
      }
    >
      {icon}
      {label}
    </button>
  );
}
