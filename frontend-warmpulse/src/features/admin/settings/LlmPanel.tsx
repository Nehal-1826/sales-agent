import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, KeyRound, Loader2, PlugZap, Sparkles, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { toast } from '@/components/ui/AppToast';
import { SparklineWp } from '@/components/charts/recharts/SparklineWp';
import { chartTheme } from '@/components/charts/theme';
import {
  useUpdateLlmSettings,
  useTestLlmConnection,
  type AdminSettings,
} from './api';

const llmSchema = z.object({
  api_key: z.string().trim().optional(),
  default_cap_tokens: z.coerce
    .number()
    .int('Must be an integer')
    .min(1000, 'Minimum 1,000 tokens'),
});

type LlmValues = z.infer<typeof llmSchema>;

interface LlmPanelProps {
  settings: AdminSettings | undefined;
  delay?: number;
}

export function LlmPanel({ settings, delay = 0 }: LlmPanelProps) {
  const update = useUpdateLlmSettings();
  const test = useTestLlmConnection();
  const [testResult, setTestResult] = useState<null | { ok: boolean; error?: string }>(null);

  const form = useForm<LlmValues>({
    resolver: zodResolver(llmSchema),
    defaultValues: {
      api_key: '',
      default_cap_tokens: settings?.llm?.default_cap_tokens ?? 100_000,
    },
  });

  useEffect(() => {
    form.reset({
      api_key: '',
      default_cap_tokens: settings?.llm?.default_cap_tokens ?? 100_000,
    });
  }, [settings?.llm?.default_cap_tokens, settings?.llm?.api_key_masked, form]);

  const onSubmit = form.handleSubmit((values) => {
    const payload: { api_key?: string; default_cap_tokens?: number } = {
      default_cap_tokens: values.default_cap_tokens,
    };
    if (values.api_key) payload.api_key = values.api_key;
    update.mutate(payload, {
      onSuccess: () => {
        toast.success('AI login details updated');
        form.reset({ api_key: '', default_cap_tokens: values.default_cap_tokens });
        setTestResult(null);
      },
      onError: () => toast.error('Failed to update AI settings'),
    });
  });

  const onTest = () => {
    setTestResult(null);
    test.mutate(undefined, {
      onSuccess: (res) => {
        setTestResult(res);
        if (res.ok) toast.success('AI key is valid');
        else toast.error(res.error ?? 'AI test failed');
      },
      onError: () => {
        setTestResult({ ok: false, error: 'network_error' });
        toast.error('AI test failed');
      },
    });
  };

  const configured = Boolean(settings?.llm?.configured);
  const masked = settings?.llm?.api_key_masked ?? '';
  const series = settings?.llm?.spend_series ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card>
        <div className="flex items-start justify-between gap-3 border-b border-border-muted p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="text-base font-semibold text-text">AI provider</h3>
            </div>
            <p className="mt-1 text-xs text-text-dim">
              Login details + default monthly token cap per subscriber (spec §6).
            </p>
          </div>
          <Badge variant={configured ? 'green' : 'orange'}>
            {configured ? 'Configured' : 'Missing key'}
          </Badge>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              label="API key"
              htmlFor="llm-api-key"
              hint={
                masked
                  ? `Current: ${masked} — leave blank to keep unchanged.`
                  : 'Paste a Anthropic / Gemini API key.'
              }
              error={form.formState.errors.api_key?.message}
            >
              <Input
                id="llm-api-key"
                type="password"
                autoComplete="new-password"
                placeholder="sk-••••••••••••"
                {...form.register('api_key')}
              />
            </FormField>

            <FormField
              label="Default cap (tokens / month)"
              htmlFor="llm-default-cap"
              hint="Used for plans that don't override their own cap."
              error={form.formState.errors.default_cap_tokens?.message}
            >
              <Input
                id="llm-default-cap"
                type="number"
                min={1000}
                step={1000}
                {...form.register('default_cap_tokens')}
                invalid={!!form.formState.errors.default_cap_tokens}
              />
            </FormField>
          </div>

          {/* Inline sparkline — redundant with LlmSpendMiniChart but useful
              in-context when the user is tweaking the cap. */}
          <div className="rounded-lg border border-border-muted bg-surface-2/40 p-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-text-dim">
              <span>Recent spend (USD / day)</span>
              <span className="tabular-nums">
                MTD: ${(settings?.llm?.spend_mtd_usd ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="h-10">
              {series.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[11px] text-text-dim">
                  No spend recorded yet
                </div>
              ) : (
                <SparklineWp
                  data={series as unknown as Array<Record<string, unknown>>}
                  yKey="cost_usd"
                  color={chartTheme.colors.primary}
                  height={40}
                  area
                />
              )}
            </div>
          </div>

          {testResult ? (
            <div
              className={
                testResult.ok
                  ? 'flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent'
                  : 'flex items-center gap-2 rounded-lg border border-accent3/30 bg-accent3/10 px-3 py-2 text-xs text-accent3'
              }
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              <span>
                {testResult.ok
                  ? 'AI key accepted — ready for content generation.'
                  : `Test failed: ${testResult.error ?? 'unknown error'}`}
              </span>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              leftIcon={
                test.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )
              }
              onClick={onTest}
              disabled={test.isPending}
            >
              {test.isPending ? 'Testing…' : 'Test key'}
            </Button>
            <Button
              type="submit"
              leftIcon={
                update.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )
              }
              disabled={update.isPending}
            >
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Card>
    </motion.div>
  );
}
