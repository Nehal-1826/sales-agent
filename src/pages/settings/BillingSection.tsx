import { useEffect, useState } from 'react';
import { LoadError, Skeleton, toast } from '../../components/feedback';
import { Modal } from '../../components/overlay';
import { cancelSubscription, changePlan, getSubscription, startCheckout } from '../../lib/api';
import type { BillingCurrency, BillingInterval, SubscriptionInfo } from '../../lib/api';
import { runCheckout } from '../../lib/checkout';
import { useAsync } from '../../lib/hooks';
import { TIERS, detectCurrency, formatMoney } from '../../marketing/pricing';
import { BillingDetailsForm, InvoicesTable, UsageMeters } from './BillingParts';

const STATUS_TEXT: Record<string, string> = {
  pending: 'Not paid yet',
  active: 'Active',
  past_due: 'Payment failed',
  canceled: 'Canceled',
  expired: 'Expired',
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function CancelModal({ sub, onClose, onDone }: { sub: SubscriptionInfo; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const refundable = !!sub.can_refund_until && new Date(sub.can_refund_until).getTime() > Date.now();
  const confirm = async () => {
    setBusy(true);
    const r = await cancelSubscription();
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const d = r.data;
    if (d.refunded && d.currency) toast.success(`Canceled. Refund of ${formatMoney(d.refunded / 100, d.currency)} is on its way.`);
    else if (d.cancel_at_period_end) toast.success(`Canceled. You keep access until ${fmtDate(sub.current_period_end)}.`);
    else toast.success('Subscription canceled.');
    onDone();
    onClose();
  };
  return (
    <Modal
      title="Cancel subscription?"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Keep my plan
          </button>
          <button className="btn btn-danger" onClick={confirm} disabled={busy}>
            {busy ? 'Canceling…' : 'Yes, cancel'}
          </button>
        </>
      }
    >
      {refundable ? (
        <p>
          You are within the 10-day window (until {fmtDate(sub.can_refund_until)}). Canceling now ends access
          immediately and refunds the unused part of the period you paid for, minus a small non-refundable fee.
        </p>
      ) : (
        <p>
          The 10-day refund window has passed, so there is no refund. You keep access until{' '}
          {fmtDate(sub.current_period_end)}, then the plan stops renewing.
        </p>
      )}
    </Modal>
  );
}

/** Settings → Plan & billing (owner / admin). */
export function BillingSection() {
  const sub = useAsync(getSubscription);
  const [currency, setCurrency] = useState<BillingCurrency>(detectCurrency);
  const [interval, setInterval_] = useState<BillingInterval>('month');
  const [choosing, setChoosing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (sub.data?.currency) setCurrency(sub.data.currency);
    if (sub.data?.interval) setInterval_(sub.data.interval);
  }, [sub.data?.currency, sub.data?.interval]);

  if (sub.loading) return <section className="panel"><Skeleton rows={4} height={38} /></section>;
  if (!sub.data) return <LoadError message={sub.error ?? 'Billing is unavailable.'} onRetry={() => void sub.reload()} />;
  const s = sub.data;
  const paid = s.status === 'active' || s.status === 'past_due';

  const pick = async (code: string) => {
    setBusy(code);
    const res = paid ? await changePlan(code, interval, currency) : await startCheckout(code, interval, currency);
    if (!res.ok) {
      setBusy('');
      if (res.status === 403) toast.error('Verify your email first (check your inbox), then try again.');
      else toast.error(res.error);
      return;
    }
    const msg = await runCheckout(res.data, () => {
      toast.success('Payment received. Activating your plan…');
      window.setTimeout(() => void sub.reload(), 2500);
    });
    setBusy('');
    if (msg) toast.error(msg);
    else if (!res.data.redirect_url && !res.data.url && !res.data.razorpay_options && !res.data.options) void sub.reload();
  };

  return (
    <>
      <section className="panel settings-panel" aria-labelledby="sec-plan">
        <h2 id="sec-plan" className="section-title">Your plan</h2>
        <div className="billing-plan-card">
          <div>
            <strong className="billing-plan-name">{s.plan?.name ?? 'No plan yet'}</strong>
            <span className={`billing-status billing-${s.status}`}>{STATUS_TEXT[s.status] ?? s.status}</span>
          </div>
          {paid && (
            <small>
              {s.cancel_at_period_end ? 'Ends' : 'Renews'} on {fmtDate(s.current_period_end)}
            </small>
          )}
        </div>
        <UsageMeters usage={s.usage} />
        <div className="billing-actions">
          <button className="btn btn-primary" onClick={() => setChoosing((v) => !v)}>
            {paid ? 'Change plan' : 'Choose a plan'}
          </button>
          {paid && !s.cancel_at_period_end && (
            <button className="btn" onClick={() => setCanceling(true)}>
              Cancel subscription
            </button>
          )}
        </div>
        {choosing && (
          <div className="billing-picker">
            <div className="mk-toggle" role="group" aria-label="Billing period">
              <button type="button" aria-pressed={interval === 'month'} onClick={() => setInterval_('month')}>Monthly</button>
              <button type="button" aria-pressed={interval === 'year'} onClick={() => setInterval_('year')}>Yearly</button>
            </div>
            <div className="mk-toggle" role="group" aria-label="Currency">
              <button type="button" aria-pressed={currency === 'INR'} onClick={() => setCurrency('INR')}>INR</button>
              <button type="button" aria-pressed={currency === 'USD'} onClick={() => setCurrency('USD')}>USD</button>
            </div>
            <div className="billing-plans">
              {TIERS.map((t) => {
                const amt = currency === 'INR' ? (interval === 'month' ? t.inr : t.inrYear) : interval === 'month' ? t.usd : t.usdYear;
                return (
                  <div key={t.id} className="billing-plan-opt">
                    <strong>{t.name}</strong>
                    <span>{formatMoney(amt, currency)} / {interval === 'month' ? 'month' : 'year'}</span>
                    <button className="btn btn-sm btn-primary" disabled={!!busy || (paid && s.plan?.code === t.id && s.interval === interval)} onClick={() => void pick(t.id)}>
                      {busy === t.id ? 'Opening…' : paid ? 'Switch' : 'Pay'}
                    </button>
                  </div>
                );
              })}
            </div>
            {currency === 'INR' && <small>Prices exclude 18% GST. First payment includes 10 bonus days.</small>}
          </div>
        )}
      </section>
      <section className="panel settings-panel" aria-labelledby="sec-inv">
        <h2 id="sec-inv" className="section-title">Invoices</h2>
        <InvoicesTable />
      </section>
      <section className="panel settings-panel" aria-labelledby="sec-bd">
        <h2 id="sec-bd" className="section-title">Billing details</h2>
        <BillingDetailsForm />
      </section>
      {canceling && <CancelModal sub={s} onClose={() => setCanceling(false)} onDone={() => void sub.reload()} />}
    </>
  );
}
