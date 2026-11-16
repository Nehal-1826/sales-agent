import { AnimatedList } from '../../components/AnimatedList';
import { timeAgo } from '../../lib/format';
import { parseWarmupTs } from './chartTheme';
import type { WarmupAlert, WarmupAlertsResponse } from '../../lib/warmupApi';

/**
 * Severity by alert kind. The source derived alerts from mailbox state; this
 * port shows the backend's real notifications-inbox items, so severity maps
 * from the kind strings the backend emits (warmth_drop / bounce_spike /
 * dns_failure …) with a neutral default for unknown kinds.
 */
function severityFor(kind: string): 'danger' | 'warn' | 'info' {
  if (kind === 'bounce_spike' || kind === 'dns_failure') return 'danger';
  if (kind === 'warmth_drop') return 'warn';
  return 'info';
}

function ago(alert: WarmupAlert): string {
  if (!alert.created_at) return '';
  const ms = parseWarmupTs(alert.created_at);
  return Number.isNaN(ms) ? '' : timeAgo(new Date(ms).toISOString());
}

/**
 * Backend alerts as a stack of severity-tinted rows (port of source
 * AlertsStack, fed by warmupAlerts() instead of derived mailbox checks).
 */
export function AlertsStack({ alerts }: { alerts: WarmupAlertsResponse }) {
  if (alerts.items.length === 0) {
    return <div className="warmup-alerts-empty">No alerts — everything looks healthy.</div>;
  }
  return (
    <AnimatedList
      items={alerts.items}
      asList
      interactiveRows
      listClassName="warmup-alert-list"
      itemClassName={(a) => `warmup-alert sev-${severityFor(a.kind)}${a.read_at ? '' : ' unread'}`}
      getItemKey={(a) => a.id}
      animation="slide"
      theme="dark"
      frame={false}
      width="100%"
      maxHeight={320}
      gap={8}
      accentColor="var(--accent)"
      renderItem={(a) => (
        <>
          <div className="warmup-alert-body">
            <p className="warmup-alert-title">{a.title}</p>
            <p className="warmup-alert-text">{a.body}</p>
          </div>
          <span className="warmup-alert-ago" title={a.created_at ?? undefined}>{ago(a)}</span>
        </>
      )}
    />
  );
}
