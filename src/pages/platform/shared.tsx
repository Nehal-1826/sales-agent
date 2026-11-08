import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '../../components/overlay';
import { Field } from '../../components/ui';
import { toast } from '../../components/feedback';
import type { Result } from '../../lib/transport';

export const PLATFORM_PAGES = ['overview', 'tenants', 'payments', 'invoices', 'marketing', 'plans', 'audit'] as const;
export type PlatformPage = (typeof PLATFORM_PAGES)[number];

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
      <button className="btn btn-sm" disabled={!previous} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span aria-live="polite">Page {page}</span>
      <button className="btn btn-sm" disabled={!next} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

/** Confirm dialog with a required reason. Closes only on a real server success; errors stay visible. */
export function ReasonDialog({
  title,
  confirmLabel,
  danger = false,
  demo,
  children,
  extraValid = true,
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
  run: (reason: string) => Promise<Result<unknown>>;
  onClose: () => void;
  onDone: () => void;
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
    toast.success(`${title}: done`);
    onDone();
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
