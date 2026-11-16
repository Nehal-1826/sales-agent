/**
 * Audit log feature hooks.
 *
 * - `useAdminAuditLog` is a thin re-export of the parent admin api hook so
 *   this folder is the single import point for audit components.
 * - `useAuditChart` derives a compact action-count series from the current
 *   audit log page (no new endpoint needed — uses the `by_type` summary the
 *   backend already returns, falling back to deriving from `items` if the
 *   backend hasn't populated that field yet).
 */
import { useMemo } from 'react';
import { useAdminAuditLog } from '@/features/admin/api';
import type { AuditFilters, AuditLogResponse } from '@/features/admin/types';

export { useAdminAuditLog };
export type { AuditFilters, AuditLogResponse };

export interface AuditActionBucket {
  action: string;
  count: number;
}

export interface AuditChartResult {
  data: AuditActionBucket[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Derive action-type counts for the overview chart.
 *
 * Prefers the backend-provided `by_type` summary when present (authoritative
 * across all pages). When absent, falls back to counting the `items` currently
 * loaded on the first page so the chart still shows something useful.
 */
export function useAuditChart(filters?: AuditFilters): AuditChartResult {
  // Pull a generous first page so the fallback aggregation is representative.
  // The backend can still override via `by_type` when it's wired up.
  const effective: AuditFilters = { page: 1, page_size: 200, ...(filters ?? {}) };
  const q = useAdminAuditLog(effective);

  const data = useMemo<AuditActionBucket[]>(() => {
    const resp = q.data;
    if (!resp) return [];
    if (resp.by_type && resp.by_type.length > 0) {
      return [...resp.by_type].sort((a, b) => b.count - a.count);
    }
    const counts = new Map<string, number>();
    for (const item of resp.items) {
      counts.set(item.action, (counts.get(item.action) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);
  }, [q.data]);

  return { data, isLoading: q.isLoading, isError: q.isError };
}
