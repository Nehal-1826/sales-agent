import { Link } from 'react-router-dom';
import { AlertTriangle, PauseCircle, ShieldAlert, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { Mailbox } from '@/features/mailboxes/types';
import { cn } from '@/lib/cn';

interface AlertsStackProps {
  mailboxes: Mailbox[];
  planCap?: number;
}

type AlertSeverity = 'danger' | 'warn' | 'info';

interface AlertItem {
  id: string;
  severity: AlertSeverity;
  icon: typeof AlertTriangle;
  title: string;
  body: string;
  action?: { label: string; to: string };
}

const SEVERITY: Record<AlertSeverity, { border: string; bg: string; text: string; chip: string }> = {
  danger: {
    border: 'border-accent3/30',
    bg: 'bg-accent3/5',
    text: 'text-accent3',
    chip: 'bg-accent3/10 text-accent3',
  },
  warn: {
    border: 'border-accent4/30',
    bg: 'bg-accent4/5',
    text: 'text-accent4',
    chip: 'bg-accent4/10 text-accent4',
  },
  info: {
    border: 'border-accent2/30',
    bg: 'bg-accent2/5',
    text: 'text-accent2',
    chip: 'bg-accent2/10 text-accent2',
  },
};

function deriveAlerts(mailboxes: Mailbox[], planCap?: number): AlertItem[] {
  const alerts: AlertItem[] = [];

  // DNS broken: any mailbox with spf/dkim/dmarc explicitly false.
  const dnsBroken = mailboxes.filter(
    (m) => m.spf_valid === false || m.dkim_valid === false || m.dmarc_valid === false,
  );
  const firstBroken = dnsBroken[0];
  if (firstBroken) {
    alerts.push({
      id: 'dns-broken',
      severity: 'danger',
      icon: ShieldAlert,
      title: `DNS issues on ${dnsBroken.length} mailbox${dnsBroken.length === 1 ? '' : 'es'}`,
      body:
        'SPF, DKIM or DMARC are failing — this caps deliverability regardless of warmth score. Fix records to recover placement.',
      action: { label: 'Review DNS', to: `/app/mailboxes/${firstBroken.id}` },
    });
  }

  // Paused >24h.
  const now = Date.now();
  const stale = mailboxes.filter(
    (m) =>
      m.is_paused &&
      m.last_activity_at &&
      now - new Date(m.last_activity_at).getTime() > 24 * 3600 * 1000,
  );
  if (stale.length > 0) {
    alerts.push({
      id: 'paused-stale',
      severity: 'warn',
      icon: PauseCircle,
      title: `${stale.length} paused mailbox${stale.length === 1 ? '' : 'es'} > 24h`,
      body: 'Long pauses reset progress — ESPs downgrade reputation for inactivity. Resume when you can.',
      action: { label: 'Manage mailboxes', to: '/app/mailboxes' },
    });
  }

  // Warmth dropped — no historical data, so we use current warmth < 40 as proxy.
  const cold = mailboxes.filter((m) => m.warmth_score < 40 && m.warmup_status === 'active');
  if (cold.length > 0) {
    alerts.push({
      id: 'warmth-low',
      severity: 'warn',
      icon: TrendingDown,
      title: `${cold.length} mailbox${cold.length === 1 ? '' : 'es'} running cold`,
      body:
        'Warmth below 40 indicates poor placement — consider reducing daily volume or checking DNS.',
      action: { label: 'View mailboxes', to: '/app/mailboxes' },
    });
  }

  // Plan cap.
  if (planCap && mailboxes.length >= planCap - 1) {
    alerts.push({
      id: 'plan-cap',
      severity: 'info',
      icon: AlertTriangle,
      title: `Approaching plan cap (${mailboxes.length}/${planCap})`,
      body: 'You are near your plan limit. Upgrade to add more mailboxes without interruption.',
      action: { label: 'See plans', to: '/app/billing' },
    });
  }

  return alerts;
}

export function AlertsStack({ mailboxes, planCap }: AlertsStackProps) {
  const alerts = deriveAlerts(mailboxes, planCap);

  if (alerts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts</CardTitle>
        <p className="text-xs text-text-dim">
          Issues to resolve for best deliverability.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {alerts.map((a) => {
          const style = SEVERITY[a.severity];
          const Icon = a.icon;
          return (
            <div
              key={a.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                style.border,
                style.bg,
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  style.chip,
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', style.text)}>{a.title}</p>
                <p className="mt-0.5 text-xs text-text-dim">{a.body}</p>
              </div>
              {a.action ? (
                <Button asChild size="sm" variant="secondary">
                  <Link to={a.action.to}>{a.action.label}</Link>
                </Button>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
