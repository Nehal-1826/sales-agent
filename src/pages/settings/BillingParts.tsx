import { useEffect, useState } from 'react';
import { toast } from '../../components/feedback';
import { Field } from '../../components/ui';
import { getBillingDetails, getInvoices, saveBillingDetails, usageList, viewInvoice } from '../../lib/api';
import type { BillingDetails, SubscriptionInfo } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { formatMoney } from '../../marketing/pricing';

const METER_LABELS: Record<string, string> = {
  leads: 'New leads this period',
  emails: 'Emails sent this period',
  mailboxes: 'Mailboxes',
  seats: 'Team seats',
  sequences: 'Follow-up sequences',
  runs_per_day: 'Automatic runs today',
  runs: 'Automatic runs today',
  ai_messages: 'Assistant messages this period',
  ai_msgs: 'Assistant messages this period',
};

export function UsageMeters({ usage }: { usage: SubscriptionInfo['usage'] }) {
  const meters = usageList(usage);
  if (!meters.length) return null;
  return (
    <div className="billing-meters">
      {meters.map((m) => {
        const unlimited = m.limit < 0;
        const pct = unlimited || m.limit === 0 ? 0 : Math.min(100, Math.round((m.used / m.limit) * 100));
        return (
          <div key={m.meter} className="billing-meter">
            <div className="billing-meter-head">
              <span>{METER_LABELS[m.meter] ?? m.meter}</span>
              <strong>
                {m.used.toLocaleString()} / {unlimited ? 'Unlimited' : m.limit.toLocaleString()}
              </strong>
            </div>
            <div
              className="billing-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={METER_LABELS[m.meter] ?? m.meter}
            >
              <span className={pct >= 90 ? 'full' : ''} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function InvoicesTable() {
  const inv = useAsync(getInvoices);
  if (inv.loading) return <p className="muted">Loading invoices…</p>;
  if (inv.error) return <p className="muted">Invoices are unavailable right now.</p>;
  if (!inv.data?.length) return <p className="muted">No invoices yet.</p>;
  return (
    <table className="billing-table">
      <thead>
        <tr>
          <th scope="col">Invoice</th>
          <th scope="col">Date</th>
          <th scope="col">Status</th>
          <th scope="col">Total</th>
          <th scope="col" />
        </tr>
      </thead>
      <tbody>
        {inv.data.map((i) => (
          <tr key={i.id}>
            <td>{i.number}</td>
            <td>{new Date(i.issued_at).toLocaleDateString()}</td>
            <td>{i.status}</td>
            <td>{formatMoney(i.total / 100, i.currency)}</td>
            <td>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const r = await viewInvoice(i.id);
                  if (!r.ok) toast.error(r.error);
                }}
              >
                View
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const EMPTY: BillingDetails = { billing_name: '', billing_email: '', billing_address: '', gstin: '' };

export function BillingDetailsForm() {
  const [d, setD] = useState<BillingDetails>(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getBillingDetails()
      .then((x) => setD({ ...EMPTY, ...x }))
      .catch(() => undefined);
  }, []);
  const set = (k: keyof BillingDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await saveBillingDetails({ ...d, gstin: d.gstin.trim().toUpperCase() });
    setBusy(false);
    if (r.ok) toast.success('Billing details saved.');
    else toast.error(r.error);
  };
  return (
    <form onSubmit={submit}>
      <div className="settings-grid">
        <Field label="Billing name">
          <input value={d.billing_name} onChange={set('billing_name')} />
        </Field>
        <Field label="Billing email">
          <input type="email" value={d.billing_email} onChange={set('billing_email')} />
        </Field>
        <Field label="GSTIN (optional)" hint="15 characters, for Indian GST invoices.">
          <input value={d.gstin} onChange={set('gstin')} maxLength={15} />
        </Field>
        <Field label="Billing address">
          <textarea rows={3} value={d.billing_address} onChange={set('billing_address')} />
        </Field>
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save billing details'}
      </button>
    </form>
  );
}
