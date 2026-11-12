import { useState } from 'react';
import { PageHeader, Field } from '../../components/ui';
import { LoadError, Skeleton, EmptyState } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { listPayments, refundPayment, money } from '../../lib/platform';
import type { PaymentRow } from '../../lib/platform';
import { Pager, ReasonDialog } from './shared';

const when = (s?: string) => (s ? new Date(s).toLocaleString() : '—');

function refundable(p: PaymentRow): number {
  return Math.max(0, p.refundable ?? p.amount - (p.refunded_amount ?? 0));
}

export function PaymentsPage({ demo }: { demo: boolean }) {
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<PaymentRow | null>(null);
  const [amount, setAmount] = useState('');
  const { data, error, reload } = useAsync(() => listPayments(page), [page], { keepStale: true });

  const maxMajor = target ? refundable(target) / 100 : 0;
  const minor = Math.round(Number(amount) * 100);
  const valid = !!target && Number(amount) > 0 && minor <= refundable(target);

  return (
    <>
      <PageHeader title="Payments" />
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!data && !error && <Skeleton rows={5} />}
      {data && data.results.length === 0 && <EmptyState title="No payments yet" />}
      {data && data.results.length > 0 && (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead>
              <tr><th>Date</th><th>Workspace</th><th>Amount</th><th>Refunded</th><th>Status</th><th>Gateway</th><th /></tr>
            </thead>
            <tbody>
              {data.results.map((p) => (
                <tr key={p.id}>
                  <td>{when(p.created_at)}</td>
                  <td>{p.workspace ?? p.tenant ?? '—'}</td>
                  <td>{money(p.amount, p.currency)}</td>
                  <td>{money(p.refunded_amount ?? 0, p.currency)}</td>
                  <td>{p.status}</td>
                  <td>{p.gateway ?? '—'}</td>
                  <td>
                    <button className="btn btn-sm" disabled={refundable(p) <= 0} onClick={() => { setTarget(p); setAmount(String(refundable(p) / 100)); }}>
                      Refund…
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={page} count={data.count} next={data.next} previous={data.previous} onPage={setPage} />}
      {target && (
        <ReasonDialog
          title="Refund payment"
          confirmLabel="Refund"
          danger
          demo={demo}
          extraValid={valid}
          run={(reason) => refundPayment(target.id, minor, reason)}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); void reload(); }}
        >
          <Field label={`Amount (${target.currency}, max ${maxMajor})`}>
            <input type="number" min={0.01} max={maxMajor} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </ReasonDialog>
      )}
    </>
  );
}
