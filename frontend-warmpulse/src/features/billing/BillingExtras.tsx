/**
 * BillingExtras — shared billing sections shown on every plan variant:
 *   • AutoRenewCard — dummy auto-pay toggle + next-billing date.
 *   • AddOnsSection — purchasable add-on catalogue (dummy buy).
 *
 * Rendered once by the BillingPage dispatcher beneath the per-plan design so
 * all tiers get the same auto-pay + add-ons controls.
 */
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';
import { useCurrency } from '@/lib/currency';
import { useAddons, useBillingStatus, useBuyAddon, useSetAutoPay } from './api';

function AutoRenewCard() {
  const status = useBillingStatus();
  const setAutoPay = useSetAutoPay();
  const enabled = status.data?.auto_pay_enabled ?? false;
  const next = status.data?.next_billing_date;

  const toggle = async () => {
    try {
      const res = await setAutoPay.mutateAsync(!enabled);
      toast.success(res.auto_pay_enabled ? 'Auto-renew turned on.' : 'Auto-renew turned off.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not update auto-renew.'));
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <RefreshCw className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-text">Auto-renew</h3>
            <p className="text-xs text-text-dim">
              {enabled
                ? `On — your plan renews automatically${next ? ` on ${next}` : ''} (dummy charge during beta).`
                : `Off — you'll get a reminder before renewal${next ? `, due ${next}` : ''}.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={setAutoPay.isPending || status.isLoading}
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            enabled ? 'bg-accent' : 'bg-surface-2'
          } disabled:opacity-50`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </CardContent>
    </Card>
  );
}

function AddOnsSection() {
  const addons = useAddons();
  const buy = useBuyAddon();
  const { format } = useCurrency();

  const purchase = async (key: string, name: string) => {
    try {
      await buy.mutateAsync(key);
      toast.success(`${name} added.`);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not buy add-on.'));
    }
  };

  if (addons.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 text-sm text-text-dim">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading add-ons…
        </CardContent>
      </Card>
    );
  }
  const items = addons.data ?? [];
  if (items.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-text">Add-ons</h3>
          <p className="text-xs text-text-dim">Extend your plan. Dummy charge during beta.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <div
              key={a.id}
              className="flex h-full flex-col gap-2 rounded-xl border border-border-muted bg-surface-2/40 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text">{a.name}</span>
                <span className="font-mono text-xs text-text-dim">{format(a.price_cents / 100)}/mo</span>
              </div>
              <p className="flex-1 text-xs text-text-dim">{a.description}</p>
              {a.owned ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
                  <Check className="h-3.5 w-3.5" /> Active
                </span>
              ) : (
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={buy.isPending}
                  onClick={() => purchase(a.key, a.name)}
                >
                  {buy.isPending && buy.variables === a.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    `Add ${format(a.price_cents / 100)}/mo`
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function BillingExtras() {
  return (
    <div className="space-y-6">
      <AutoRenewCard />
      <AddOnsSection />
    </div>
  );
}
