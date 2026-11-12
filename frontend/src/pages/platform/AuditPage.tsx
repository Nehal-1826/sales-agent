import { useState } from 'react';
import { PageHeader } from '../../components/ui';
import { LoadError, Skeleton, EmptyState } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { listAudit } from '../../lib/platform';
import { Pager } from './shared';

export function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, error, reload } = useAsync(() => listAudit(page), [page], { keepStale: true });
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every platform admin action." />
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!data && !error && <Skeleton rows={5} />}
      {data && data.results.length === 0 && <EmptyState title="No audit entries yet" />}
      {data && data.results.length > 0 && (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Reason</th><th>IP</th></tr></thead>
            <tbody>
              {data.results.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>{a.actor ?? '—'}</td>
                  <td>{a.action}</td>
                  <td>{a.target ?? '—'}</td>
                  <td>{a.reason ?? '—'}</td>
                  <td>{a.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={page} count={data.count} next={data.next} previous={data.previous} onPage={setPage} />}
    </>
  );
}
