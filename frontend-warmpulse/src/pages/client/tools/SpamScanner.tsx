import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { GaugeWp } from '@/components/charts';
import { useRunSpamScan, useSpamScans } from '@/features/tools/api';
import { formatDateTime } from '@/lib/format';
import type { SpamScan, SpamTrigger } from '@/features/tools/types';

const FormSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(100_000),
  is_html: z.boolean(),
});
type FormValues = z.infer<typeof FormSchema>;

function triggerLabel(t: SpamTrigger): string {
  switch (t.type) {
    case 'word':
      return `Trigger word: "${t.word ?? ''}" (${t.severity})`;
    case 'caps':
      return `All-caps line: "${t.line ?? ''}"`;
    case 'punct':
      return `Excessive punctuation: "${t.line ?? ''}"`;
    case 'html':
      return 'Malformed HTML detected';
    case 'shortener':
      return `URL shortener detected: "${t.word ?? ''}"`;
    case 'unsubscribe':
      return 'HTML email missing unsubscribe link';
    default:
      return t.type;
  }
}

function gaugeColor(score: number): string {
  if (score < 30) return '#22c55e';
  if (score < 60) return '#eab308';
  return '#ef4444';
}

function ResultView({ scan }: { scan: SpamScan }) {
  const grouped = scan.triggers.reduce<Record<string, SpamTrigger[]>>((acc, t) => {
    (acc[t.type] ||= []).push(t);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Scan result</CardTitle>
        <Badge variant={scan.passed ? 'green' : 'orange'}>
          {scan.passed ? 'Passed' : 'Flagged'}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[260px_1fr]">
        <div className="flex justify-center">
          <GaugeWp
            value={scan.score}
            label="Spam risk"
            subLabel={`${Math.round(scan.score)} / 100`}
            color={gaugeColor(scan.score)}
            size={240}
          />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-dim">
            Triggers ({scan.triggers.length})
          </h3>
          {scan.triggers.length === 0 ? (
            <p className="text-sm text-text-dim">No triggers detected.</p>
          ) : (
            Object.entries(grouped).map(([type, items]) => (
              <div key={type} className="space-y-1">
                <div className="text-xs font-medium uppercase text-text-dim">{type}</div>
                <ul className="space-y-1">
                  {items.map((t, i) => (
                    <li
                      key={`${type}-${i}`}
                      className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-xs"
                    >
                      {triggerLabel(t)}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SpamScanner() {
  const runMut = useRunSpamScan();
  const historyQ = useSpamScans();
  const [current, setCurrent] = useState<SpamScan | null>(null);

  const { register, handleSubmit, setValue, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { subject: '', body: '', is_html: false },
  });
  const isHtml = watch('is_html');

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await runMut.mutateAsync(values);
      setCurrent(result);
      toast.success('Scan complete');
    } catch {
      toast.error('Scan failed');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Scan content</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <FormField label="Subject" required error={formState.errors.subject?.message}>
                <Input placeholder="Subject" {...register('subject')} />
              </FormField>
              <FormField label="Body" required error={formState.errors.body?.message}>
                <Textarea
                  rows={10}
                  placeholder="Email body"
                  {...register('body')}
                  className="font-mono text-xs"
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm text-text-dim">
                <AppSwitch
                  checked={isHtml}
                  onCheckedChange={(v) => setValue('is_html', Boolean(v))}
                />
                HTML body
              </label>
              <Button type="submit" disabled={runMut.isPending}>
                {runMut.isPending ? 'Scanning...' : 'Run spam scan'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {current ? <ResultView scan={current} /> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent scans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {historyQ.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !historyQ.data?.items.length ? (
            <p className="text-xs text-text-dim">No scans yet.</p>
          ) : (
            historyQ.data.items.slice(0, 10).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrent(s)}
                className="flex w-full items-center justify-between rounded-lg border border-border-muted bg-surface p-3 text-left text-xs hover:border-accent"
              >
                <span className="text-text-dim">
                  {formatDateTime(s.created_at)}
                </span>
                <Badge variant={s.passed ? 'green' : 'orange'}>
                  {Math.round(s.score)}
                </Badge>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
