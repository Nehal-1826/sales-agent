import { useState } from 'react';
import { PageHeader, Field, Chip } from '../../components/ui';
import { LoadError, Skeleton, EmptyState } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { listPayments, refundPayment, money } from '../../lib/platform';
import type { PaymentRow } from '../../lib/platform';
import { Pager, ReasonDialog } from './shared';

const when = (s?: string) => (s ? new Date(s).toLocaleString() : '—');

function refundable(p: PaymentRow): number {
  return Math.max(0, p.refundable ?? p.amount - (p.refunded_amount ?? 0));
}

/** Plain-English status: what happened to this customer's money. */
const STATUS: Record<string, { text: string; tone: 'success' | 'warn' | 'neutral' }> = {
  succeeded: { text: 'Paid', tone: 'success' },
  captured: { text: 'Paid', tone: 'success' },
  failed: { text: 'Failed', tone: 'warn' },
  refunded: { text: 'Returned', tone: 'neutral' },
  partially_refunded: { text: 'Partly returned', tone: 'neutral' },
  pending: { text: 'Waiting', tone: 'warn' },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS[status?.toLowerCase?.() ?? ''] ?? { text: status || '—', tone: 'neutral' as const };
  return <Chip tone={s.tone}>{s.text}</Chip>;
}

export function PaymentsPage({ demo, embedded = false }: { demo: boolean; embedded?: boolean }) {
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<PaymentRow | null>(null);
  const [amount, setAmount] = useState('');
  const { data, error, reload } = useAsync(() => listPayments(page), [page], { keepStale: true });

  const maxMajor = target ? refundable(target) / 100 : 0;
  const minor = Math.round(Number(amount) * 100);
  const valid = !!target && Number(amount) > 0 && minor <= refundable(target);

  return (
    <>
      {embedded ? (
        // inside Payment (the Payments tab): the section carries the title,
        // the sentence that matters stays
        <p className="field-hint" style={{ marginTop: 0 }}>
          Money customers paid you. You can send any of it back.
        </p>
      ) : (
        <PageHeader title="Payments" subtitle="Money customers paid you. You can send any of it back." />
      )}
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!data && !error && <Skeleton rows={5} />}
      {data && data.results.length === 0 && (
        <EmptyState title="No payments yet">When a customer pays, it shows up here.</EmptyState>
      )}
      {data && data.results.length > 0 && (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead>
              <tr><th>When</th><th>Customer</th><th>Paid</th><th>Returned</th><th>Did it go through?</th><th>Paid via</th><th /></tr>
            </thead>
            <tbody>
              {data.results.map((p) => (
                <tr key={p.id}>
                  <td>{when(p.created_at)}</td>
                  <td>{p.workspace ?? p.tenant ?? '—'}</td>
                  <td>{money(p.amount, p.currency)}</td>
                  <td>{money(p.refunded_amount ?? 0, p.currency)}</td>
                  <td><StatusChip status={p.status} /></td>
                  <td>{p.gateway ?? '—'}</td>
                  <td>
                    <button className="btn btn-sm" disabled={refundable(p) <= 0} onClick={() => { setTarget(p); setAmount(String(refundable(p) / 100)); }}>
                      Send money back…
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
          title="Send money back to the customer"
          confirmLabel="Refund"
          danger
          demo={demo}
          extraValid={valid}
          run={(reason) => refundPayment(target.id, minor, reason)}
          onClose={() => { setTarget(null); setAmount(''); }}
          onDone={() => { setTarget(null); setAmount(''); void reload(); }}
        >
          <Field label={`How much? (in ${target.currency}, most you can send is ${maxMajor})`}>
            <input type="number" min={0.01} max={maxMajor} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </ReasonDialog>
      )}
    </>
  );
}
