import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '../../components/overlay';
import { Field } from '../../components/ui';
import { toast } from '../../components/feedback';
import type { Result } from '../../lib/transport';

/**
 * All routable platform-console pages (`/<admin-slug>/<page>`). Order
 * mirrors the sidebar nav; the grouped display lives in PlatformShell.
 * "Payment" is ONE section with three tabs: `payment` is its Billing tab,
 * `payments` and `invoices` the other two (PaymentPage).
 */
export const PLATFORM_PAGES = [
  'overview',
  'analytics',
  'peers',
  'routing',
  'mail',
  'users',
  'tenants',
  'crm',
  'plans',
  'payment',
  'payments',
  'invoices',
  'reports',
  'audit',
  'settings',
  'marketing',
] as const;
export type PlatformPage = (typeof PLATFORM_PAGES)[number];

/** The Payment section's tabs — each is also the last part of its address. */
export const PAYMENT_TABS = ['payment', 'payments', 'invoices'] as const;
export type PaymentTab = (typeof PAYMENT_TABS)[number];

/** Addresses that no longer have a page of their own (24 Nov 2026, owner):
 *  Billing became the first tab of Payment; AI usage, Retention and Add-ons
 *  were removed from the console. */
const OLD_PAGES: Record<string, PlatformPage> = {
  billing: 'payment',
  llm: 'overview',
  revenge: 'overview',
  addons: 'overview',
};

/** The page an address names: a current one as is, an old one mapped, and
 *  anything else (retired, mistyped) the Overview. */
export function resolvePlatformPage(page: string): PlatformPage {
  if ((PLATFORM_PAGES as readonly string[]).includes(page)) return page as PlatformPage;
  return OLD_PAGES[page] ?? 'overview';
}

export function Pager({
  page,
  count,
  next,
  previous,
  onPage,
}: {
  page: number;
  count: number;
  next: string | null;
  previous: string | null;
  onPage: (p: number) => void;
}) {
  return (
    <div className="pf-pager">
      <small>{count} total</small>
      <div className="pf-pager-btns">
        <button className="btn btn-sm" disabled={!previous} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span className="pf-pager-num" aria-live="polite">
          Page {page}
        </span>
        <button className="btn btn-sm" disabled={!next} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

/** Confirm dialog with a required reason. Closes only on a real server success; errors stay visible. */
export function ReasonDialog<T = unknown>({
  title,
  confirmLabel,
  danger = false,
  demo,
  children,
  extraValid = true,
  quiet = false,
  run,
  onClose,
  onDone,
}: {
  title: string;
  confirmLabel: string;
  danger?: boolean;
  demo: boolean;
  children?: ReactNode;
  extraValid?: boolean;
  /** No "<title>: done" toast — `onDone` says what was done in its own words. */
  quiet?: boolean;
  run: (reason: string) => Promise<Result<T>>;
  onClose: () => void;
  /** Called with the server's answer once it worked. */
  onDone: (data: T) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = reason.trim().length >= 3 && extraValid && !demo;

  async function go() {
    setBusy(true);
    setError('');
    const r = await run(reason.trim());
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (!quiet) toast.success(`${title}: done`);
    onDone(r.data);
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ok || busy} onClick={() => void go()}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {demo && <p role="note">Demo data is read-only.</p>}
      {children}
      <Field label="Reason (required, saved to the audit log)">
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && (
        <p className="pf-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
