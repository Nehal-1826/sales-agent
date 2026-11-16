import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';
import type { WorkerRow, WorkerStatus } from './api';

interface WorkerStatusTableProps {
  rows: WorkerRow[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

function statusVariant(s: WorkerStatus): BadgeVariant {
  switch (s) {
    case 'idle':
      return 'neutral';
    case 'busy':
      return 'green';
    case 'offline':
      return 'orange';
    case 'error':
      return 'orange';
    default:
      return 'neutral';
  }
}

function statusLabel(s: WorkerStatus): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Format an ISO timestamp as a relative "Xs ago" string. */
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 'in the future';
  const s = Math.round(diffMs / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function WorkerStatusTable({
  rows,
  isLoading = false,
  isError = false,
  delay = 0,
}: WorkerStatusTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border-muted p-5">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Worker heartbeats</h3>
            <p className="text-xs text-text-dim">
              Celery workers currently registered with the control plane.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-5">
            <EmptyState title="Couldn't load workers" description="Refresh to try again." />
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No workers online"
              description="Start the warmpulse-worker systemd service to see heartbeats here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead className="bg-surface-2/50 text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                    Worker
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                    Host
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                    Last heartbeat
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                    Current task
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {rows.map((w) => {
                  const offline = w.status === 'offline' || w.status === 'error';
                  return (
                    <tr
                      key={w.id}
                      className={cn(
                        'transition-colors',
                        offline ? 'bg-accent3/5 hover:bg-accent3/10' : 'hover:bg-surface-2/50',
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-text">{w.id}</td>
                      <td className="px-4 py-3 text-sm text-text-dim">{w.host}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(w.status)}>{statusLabel(w.status)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-dim tabular-nums">
                        {relativeTime(w.last_heartbeat)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {w.current_task ? (
                          <span className="font-mono text-xs text-text-dim">{w.current_task}</span>
                        ) : (
                          <span className="text-xs italic text-text-dim/70">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
