import { useState } from 'react';
import { PageHeader } from '../../components/ui';
import { LoadError, Skeleton, EmptyState, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { listInvoices, viewPlatformInvoice, money } from '../../lib/platform';
import { Pager } from './shared';

export function InvoicesPage() {
  const [page, setPage] = useState(1);
  const { data, error, reload } = useAsync(() => listInvoices(page), [page], { keepStale: true });

  async function view(id: number | string) {
    const r = await viewPlatformInvoice(id);
    if (!r.ok) toast.error(r.error);
  }

  return (
    <>
      <PageHeader title="Invoices" />
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!data && !error && <Skeleton rows={5} />}
      {data && data.results.length === 0 && <EmptyState title="No invoices yet" />}
      {data && data.results.length > 0 && (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead>
              <tr><th>Number</th><th>Workspace</th><th>Issued</th><th>Total</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {data.results.map((i) => (
                <tr key={i.id}>
                  <td>{i.number}</td>
                  <td>{i.workspace ?? i.tenant ?? '—'}</td>
                  <td>{new Date(i.issued_at).toLocaleDateString()}</td>
                  <td>{money(i.total, i.currency)}</td>
                  <td>{i.status}</td>
                  <td><button className="btn btn-sm" onClick={() => void view(i.id)}>View</button></td>
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
