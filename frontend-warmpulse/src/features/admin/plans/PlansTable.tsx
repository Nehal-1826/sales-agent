import { motion } from 'framer-motion';
import { Pencil } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Plan } from './api';

interface PlansTableProps {
  rows: Plan[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onEdit: (plan: Plan) => void;
  delay?: number;
}

function fmtUsd(v: number): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `$${v.toFixed(0)}`;
  }
}

function fmtInt(v: number | undefined | null): string {
  if (v === undefined || v === null) return '—';
  return Number(v).toLocaleString();
}

export function PlansTable({
  rows,
  isLoading,
  isError,
  onEdit,
  delay = 0,
}: PlansTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border-muted p-5">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Pricing plans</h3>
            <p className="text-xs text-text-dim">
              Configure the price, mailbox allowances, and  token caps for each plan.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-5">
            <EmptyState
              title="Couldn't load plans"
              description="Refresh to try again."
            />
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No plans configured"
              description="Seed the plans fixture on the backend to see Starter, Pro, and Agency here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead className="bg-surface-2/50 text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim text-right">
                    Price / mo
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim text-right">
                    Mailboxes
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim text-right">
                    Daily cap
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim text-right">
                    Token cap / mo
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {rows.map((plan) => {
                  const extra = plan as Plan & { daily_email_cap?: number };
                  const dailyCap = extra.daily_email_cap;
                  return (
                    <tr
                      key={plan.id}
                      className="transition-colors hover:bg-surface-2/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-text">{plan.name}</span>
                          <span className="font-mono text-[11px] text-text-dim">
                            {plan.slug}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-text">
                        {fmtUsd(plan.price_monthly_usd)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-text">
                        <div className="flex flex-col items-end">
                          <span>{fmtInt(plan.max_mailboxes)}</span>
                          <span className="text-[11px] text-text-dim">
                            incl {fmtInt(plan.mailboxes_included)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-text-dim">
                        {fmtInt(dailyCap)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-text-dim">
                        {fmtInt(plan.llm_token_cap)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={plan.is_active ? 'green' : 'neutral'}>
                          {plan.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Pencil className="h-3.5 w-3.5" />}
                          onClick={() => onEdit(plan)}
                        >
                          Edit
                        </Button>
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
