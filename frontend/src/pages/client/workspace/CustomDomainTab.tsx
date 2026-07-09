import { useState, type FormEvent } from 'react';
import {
  Copy,
  ExternalLink,
  Globe,
  Lock,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { usePlan } from '@/lib/usePlan';
import { formatDateTime as _fmtDateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { toast } from '@/components/ui/AppToast';
import {
  StartCustomDomainError,
  useCustomDomain,
  useRemoveCustomDomain,
  useStartCustomDomain,
  useVerifyCustomDomain,
  type CustomDomain,
} from '@/features/custom-domain/api';

const PORTAL_CNAME_TARGET = 'app.warmpulse.io';

function copy(value: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    toast.error('Clipboard unavailable in this browser');
    return;
  }
  navigator.clipboard.writeText(value).then(
    () => toast.success('Copied to clipboard'),
    () => toast.error('Could not copy'),
  );
}

function formatVerifiedAt(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return _fmtDateTime(d);
  } catch {
    return iso;
  }
}

interface CopyRowProps {
  label: string;
  value: string;
}

function CopyRow({ label, value }: CopyRowProps): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-text-dim">{label}</div>
      <div className="flex items-center gap-2 rounded-md border border-border-muted bg-surface-2/40 px-3 py-2">
        <code className="flex-1 truncate font-mono text-xs text-text">{value}</code>
        <button
          type="button"
          onClick={() => copy(value)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border-muted bg-surface px-2 py-1 text-xs text-text-dim hover:text-text"
          aria-label={`Copy ${label}`}
        >
          <Copy size={12} /> Copy
        </button>
      </div>
    </div>
  );
}

interface InstructionsCardsProps {
  domain: CustomDomain;
}

function InstructionsCards({ domain }: InstructionsCardsProps): JSX.Element {
  const txtHost = `_warmpulse-verify.${domain.domain}`;
  const txtValue = `warmpulse-verify-${domain.verification_code}`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">TXT (recommended)</CardTitle>
          <CardDescription>
            Lets you keep your existing A / CNAME for {domain.domain}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CopyRow label="Type" value="TXT" />
          <CopyRow label="Host / Name" value={txtHost} />
          <CopyRow label="Value" value={txtValue} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CNAME (alternative)</CardTitle>
          <CardDescription>
            Use this if your DNS host doesn't accept underscore TXT records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CopyRow label="Type" value="CNAME" />
          <CopyRow label="Host / Name" value={domain.domain} />
          <CopyRow label="Points to" value={PORTAL_CNAME_TARGET} />
        </CardContent>
      </Card>
    </div>
  );
}

export function CustomDomainTab(): JSX.Element {
  const { isAgency, isLoading: planLoading } = usePlan();
  const query = useCustomDomain();
  const start = useStartCustomDomain();
  const verify = useVerifyCustomDomain();
  const remove = useRemoveCustomDomain();

  const [domainInput, setDomainInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  if (planLoading) {
    return (
      <div className="space-y-3">
        <div className="h-7 w-48 animate-pulse rounded bg-surface-2/60" />
        <div className="h-64 w-full animate-pulse rounded-2xl bg-surface-2/60" />
      </div>
    );
  }

  // ----- agency gate -----
  if (!isAgency) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock size={16} className="text-text-dim" />
            Upgrade to Agency to use a custom domain
          </CardTitle>
          <CardDescription>
            Serve your client portal from your own domain — e.g.{' '}
            <code className="font-mono">clients.youragency.com</code> — instead
            of <code className="font-mono">warmpulse.io</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="primary" asChild>
            <a href="/app/billing">Upgrade plan</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const header = (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">
        Custom domain · Agency tier
      </h2>
      <p className="text-sm text-text-dim">
        Serve your client portal from your own domain — e.g.{' '}
        <code className="font-mono">clients.youragency.com</code> — instead of{' '}
        <code className="font-mono">warmpulse.io</code>.
      </p>
    </div>
  );

  // ----- loading the query -----
  if (query.isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="h-40 w-full animate-pulse rounded-2xl bg-surface-2/60" />
      </div>
    );
  }

  const data = query.data ?? null;

  // ----- no domain configured -----
  async function handleStart(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const value = domainInput.trim().toLowerCase();
    if (!value) {
      setFormError(
        'Invalid domain format · use a lowercase hostname like clients.youragency.com',
      );
      return;
    }
    try {
      await start.mutateAsync({ domain: value });
      setDomainInput('');
      toast.success('Domain registered · publish a DNS record and verify');
    } catch (err) {
      if (err instanceof StartCustomDomainError) {
        if (err.code === 'invalid_format') {
          setFormError(
            'Invalid domain format · use a lowercase hostname like clients.youragency.com',
          );
        } else if (err.code === 'duplicate') {
          setFormError(
            'That domain is already registered to another workspace',
          );
        } else if (err.code === 'plan_required') {
          setFormError('Agency tier required');
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Failed to register custom domain.');
      }
    }
  }

  if (data === null) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardHeader>
            <CardTitle>Add a custom domain</CardTitle>
            <CardDescription>
              Pick a hostname you control. We'll give you a DNS record to
              publish — once it resolves, we'll start serving your portal there.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleStart} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="custom-domain-input">Domain</Label>
                <Input
                  id="custom-domain-input"
                  value={domainInput}
                  onChange={(e) => {
                    setDomainInput(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="clients.youragency.com"
                  autoComplete="off"
                  spellCheck={false}
                  invalid={formError !== null}
                />
                {formError ? (
                  <p className="text-xs text-accent3">{formError}</p>
                ) : null}
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={start.isPending}
                  leftIcon={<Globe size={14} />}
                >
                  Add domain
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----- handlers shared by pending / failed / verified states -----
  async function handleVerify() {
    try {
      await verify.mutateAsync();
      toast.success('Verification check complete');
    } catch {
      toast.error('Verification check failed.');
    }
  }

  async function handleCancel() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Cancel this custom domain setup?')
    ) {
      return;
    }
    try {
      await remove.mutateAsync();
      toast.success('Custom domain removed');
    } catch {
      toast.error('Failed to remove custom domain.');
    }
  }

  async function handleRemoveVerified() {
    if (
      typeof window !== 'undefined' &&
      data &&
      !window.confirm(
        `This will stop serving your portal at ${data.domain}. Continue?`,
      )
    ) {
      return;
    }
    try {
      await remove.mutateAsync();
      toast.success('Custom domain removed');
    } catch {
      toast.error('Failed to remove custom domain.');
    }
  }

  // ----- verified -----
  if (data.status === 'verified') {
    const url = `https://${data.domain}`;
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Active
              </span>
              <span className="text-lg font-semibold text-text">
                {data.domain}
              </span>
            </div>
            <CardDescription className="mt-1">
              Verified via {data.verification_method ?? 'DNS'} on{' '}
              {formatVerifiedAt(data.verified_at)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-base font-medium text-accent hover:underline"
            >
              {url}
              <ExternalLink size={14} />
            </a>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} className="mr-1.5 inline" />
                  Visit your portal
                </a>
              </Button>
            </div>
            <div className="border-t border-border-muted pt-4">
              <Button
                variant="danger"
                onClick={handleRemoveVerified}
                isLoading={remove.isPending}
                leftIcon={<Trash2 size={14} />}
              >
                Remove custom domain
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----- failed -----
  if (data.status === 'failed') {
    async function handleStartOver() {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('Remove this domain and start over?')
      ) {
        return;
      }
      try {
        await remove.mutateAsync();
        toast.success('Removed · enter a new domain to start again');
      } catch {
        toast.error('Failed to remove custom domain.');
      }
    }

    return (
      <div className="space-y-6">
        {header}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-400 ring-1 ring-red-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              Verification failed
            </span>
            <span className="text-lg font-semibold text-text">{data.domain}</span>
          </div>
          {data.last_check_error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {data.last_check_error}
            </div>
          ) : null}
          <p className="text-sm text-text-dim">
            Publish either record below, then click Try again. DNS changes can
            take 5-30 minutes to propagate.
          </p>
          <InstructionsCards domain={data} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={handleVerify}
              isLoading={verify.isPending}
              leftIcon={<RefreshCw size={14} />}
            >
              Try again
            </Button>
            <Button
              variant="secondary"
              onClick={handleStartOver}
              isLoading={remove.isPending}
            >
              Start over
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ----- pending -----
  return (
    <div className="space-y-6">
      {header}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-xs font-semibold text-yellow-400 ring-1 ring-yellow-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
            Pending verification
          </span>
          <span className="text-lg font-semibold text-text">{data.domain}</span>
        </div>
        {data.last_check_error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {data.last_check_error}
          </div>
        ) : null}
        <InstructionsCards domain={data} />
        <p className="text-xs text-text-dim">
          Add either record at your DNS host, then click Verify. Most DNS
          changes propagate in 5-30 min.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={handleVerify}
            isLoading={verify.isPending}
            leftIcon={<RefreshCw size={14} />}
          >
            Verify now
          </Button>
          <Button
            variant="secondary"
            onClick={handleCancel}
            isLoading={remove.isPending}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CustomDomainTab;
