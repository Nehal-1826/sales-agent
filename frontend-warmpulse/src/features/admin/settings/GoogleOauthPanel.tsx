import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, KeyRound, Loader2, PlugZap, ShieldCheck, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { toast } from '@/components/ui/AppToast';
import { useUpdateOauthSettings, useTestOauthConnection, type AdminSettings } from './api';

const oauthSchema = z.object({
  // Empty string = leave unchanged (so we don't clobber the stored secret with "").
  client_id: z.string().trim().optional(),
  client_secret: z.string().trim().optional(),
});

type OauthValues = z.infer<typeof oauthSchema>;

interface GoogleOauthPanelProps {
  settings: AdminSettings | undefined;
  delay?: number;
}

export function GoogleOauthPanel({ settings, delay = 0 }: GoogleOauthPanelProps) {
  const update = useUpdateOauthSettings();
  const test = useTestOauthConnection();
  const [testResult, setTestResult] = useState<null | { ok: boolean; error?: string }>(null);

  const form = useForm<OauthValues>({
    resolver: zodResolver(oauthSchema),
    defaultValues: { client_id: '', client_secret: '' },
  });

  // Whenever the incoming masked client id changes, clear any stale input.
  useEffect(() => {
    form.reset({ client_id: '', client_secret: '' });
  }, [settings?.google_oauth?.client_id_masked, form]);

  const onSubmit = form.handleSubmit((values) => {
    const payload: { client_id?: string; client_secret?: string } = {};
    if (values.client_id) payload.client_id = values.client_id;
    if (values.client_secret) payload.client_secret = values.client_secret;
    if (Object.keys(payload).length === 0) {
      toast.info('Nothing to update — enter a new client id or secret first');
      return;
    }
    update.mutate(payload, {
      onSuccess: () => {
        toast.success('Google OAuth login details updated');
        form.reset({ client_id: '', client_secret: '' });
        setTestResult(null);
      },
      onError: () => toast.error('Failed to update OAuth login details'),
    });
  });

  const onTest = () => {
    setTestResult(null);
    test.mutate(undefined, {
      onSuccess: (res) => {
        setTestResult(res);
        if (res.ok) toast.success('Google OAuth reachable');
        else toast.error(res.error ?? 'Google OAuth test failed');
      },
      onError: () => {
        setTestResult({ ok: false, error: 'network_error' });
        toast.error('Google OAuth test failed');
      },
    });
  };

  const configured = Boolean(settings?.google_oauth?.configured);
  const masked = settings?.google_oauth?.client_id_masked ?? '';

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
              <ShieldCheck className="h-4 w-4 text-accent2" />
              <h3 className="text-base font-semibold text-text">Google OAuth</h3>
            </div>
            <p className="mt-1 text-xs text-text-dim">
              Client id + secret used for user sign-in and mailbox connect flows.
            </p>
          </div>
          <Badge variant={configured ? 'green' : 'orange'}>
            {configured ? 'Configured' : 'Not configured'}
          </Badge>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              label="Client ID"
              htmlFor="oauth-client-id"
              hint={masked ? `Current: ${masked}` : 'Paste the Google Cloud console Client ID.'}
              error={form.formState.errors.client_id?.message}
            >
              <Input
                id="oauth-client-id"
                autoComplete="off"
                placeholder={masked || '1234567890-abc.apps.googleusercontent.com'}
                {...form.register('client_id')}
              />
            </FormField>
            <FormField
              label="Client secret"
              htmlFor="oauth-client-secret"
              hint="Leave blank to keep the existing secret."
              error={form.formState.errors.client_secret?.message}
            >
              <Input
                id="oauth-client-secret"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••••••"
                {...form.register('client_secret')}
              />
            </FormField>
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
                  ? 'Google OAuth login details look healthy.'
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
              {test.isPending ? 'Testing…' : 'Test connection'}
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
              {update.isPending ? 'Saving…' : 'Save login details'}
            </Button>
          </div>
        </form>
      </Card>
    </motion.div>
  );
}
