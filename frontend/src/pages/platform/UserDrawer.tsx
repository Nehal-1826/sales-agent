/**
 * The user panel of the console's Users page — two separate blocks.
 *
 *  · Account — the REAL sign-in account (email, username, company, plan,
 *    status…) and "Enter workspace as this user", which acts on the account.
 *  · Warmup account — only when the warmup side keeps a copy of this email.
 *    Its buttons act on that copy only; the person can always still sign in.
 */
import { useEffect, useMemo, useState } from 'react';
import { Chip, Field } from '../../components/ui';
import { Drawer } from '../../components/overlay';
import { EmptyState, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { getSignedInAccountId } from '../../lib/platform';
import type { AccountRow } from '../../lib/platform';
import { listAdminPayments, listAdminPlans, suspendAdminUser, updateAdminUserPlan } from '../../lib/platformAdmin';
import type { AdminPayment, AdminUserRow } from '../../lib/platformAdmin';
import { ROLE_LABELS, StatusChip, displayName, fmtRelative, isPlatformAdmin, when } from './accountUi';
import { EnterWorkspaceDialog } from './EnterWorkspaceDialog';
import { ReasonDialog } from './shared';

/* ---------------- warmup payments (Warmup account block) ---------------- */

function payStatusTone(s: AdminPayment['status']): 'success' | 'warn' | 'neutral' {
  if (s === 'succeeded') return 'success';
  if (s === 'refunded') return 'neutral';
  return 'warn';
}

function UserPayments({ row }: { row: AdminUserRow }) {
  const { data, error } = useAsync(() => listAdminPayments({ user_email: row.email, page: 1, page_size: 50 }), [row.email]);
  // belt-and-suspenders: an email may have been reused — guard by user_id too
  const payments = useMemo(() => (data?.items ?? []).filter((p) => p.user_id === row.id || p.user_email === row.email), [data, row.id, row.email]);

  return (
    <>
      <h3 className="pf-h2">Payments</h3>
      {error && <p className="pf-error" role="alert">{error}</p>}
      {!data && !error && <Skeleton rows={2} />}
      {data && payments.length === 0 && <EmptyState title="No payments found" />}
      {payments.map((p) => (
        <div key={p.id} className="pf-grid" style={{ gridTemplateColumns: '1fr auto', marginBottom: 6 }}>
          <div>
            <strong>${p.amount_usd.toFixed(2)}</strong> <small>{p.plan || 'Payment'}</small>
            <div>
              <small>{when(p.created_at)}</small>
            </div>
          </div>
          <Chip tone={payStatusTone(p.status)}>{p.status}</Chip>
        </div>
      ))}
    </>
  );
}

/* ---------------- Warmup account block ---------------- */

type WarmupAct = 'pause' | 'resume';

const WARMUP_STATUS: Record<AdminUserRow['status'], string> = {
  active: 'Running',
  suspended: 'Paused',
  pending: 'Not set up yet',
};

function WarmupBlock({ warmup, demo, onChanged }: { warmup: AdminUserRow; demo: boolean; onChanged: () => void }) {
  const { data: plans } = useAsync(() => listAdminPlans(), []);
  const [act, setAct] = useState<WarmupAct | null>(null);
  const [planId, setPlanId] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const isSuspended = warmup.status === 'suspended';
  const isPending = warmup.status === 'pending';

  async function applyPlan() {
    if (!planId) return;
    setPlanBusy(true);
    const r = await updateAdminUserPlan(warmup.id, planId);
    setPlanBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Plan updated for ${warmup.email}`);
    onChanged();
  }

  return (
    <section className="drawer-section">
      <h3 className="pf-h2">Warmup account</h3>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        The buttons here change warmup only. The person can still sign in.
      </p>
      <dl className="pf-dl">
        <dt>Mailboxes</dt>
        <dd>{warmup.mailbox_count}</dd>
        <dt>Warmup</dt>
        <dd>{WARMUP_STATUS[warmup.status]}</dd>
      </dl>

      <Field label="Change plan">
        <div className="pf-actions" style={{ marginTop: 0 }}>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Plan">
            <option value="">Select plan…</option>
            {(plans ?? []).filter((p) => p.is_active).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn btn-sm" disabled={!planId || planBusy || demo} onClick={() => void applyPlan()}>
            {planBusy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </Field>

      <div className="pf-actions">
        {!isPending &&
          (isSuspended ? (
            <button className="btn" onClick={() => setAct('resume')} disabled={demo}>
              Resume warmup
            </button>
          ) : (
            <button className="btn btn-danger" onClick={() => setAct('pause')} disabled={demo}>
              Pause warmup
            </button>
          ))}
      </div>

      <UserPayments row={warmup} />

      {act === 'pause' && (
        <ReasonDialog
          title="Pause warmup account"
          confirmLabel="Pause"
          danger
          demo={demo}
          run={(reason) => suspendAdminUser(warmup.id, true, reason)}
          onClose={() => setAct(null)}
          onDone={() => {
            setAct(null);
            toast.success(`Warmup paused for ${warmup.email}.`);
            onChanged();
          }}
        >
          <p role="note">This pauses warmup for {warmup.email}. It does not turn off their sign-in.</p>
        </ReasonDialog>
      )}
      {act === 'resume' && (
        <ReasonDialog
          title="Resume warmup account"
          confirmLabel="Resume"
          demo={demo}
          run={(reason) => suspendAdminUser(warmup.id, false, reason)}
          onClose={() => setAct(null)}
          onDone={() => {
            setAct(null);
            toast.success(`Warmup resumed for ${warmup.email}.`);
            onChanged();
          }}
        >
          <p role="note">This resumes warmup for {warmup.email}.</p>
        </ReasonDialog>
      )}
    </section>
  );
}

/* ---------------- user panel ---------------- */

export function UserDrawer({
  account,
  warmup,
  demo,
  onClose,
  onChanged,
}: {
  account: AccountRow;
  /** The warmup side's copy of this email — null when it has none. */
  warmup: AdminUserRow | null;
  demo: boolean;
  onClose: () => void;
  /** Something changed on the server — the lists behind the panel are read again. */
  onChanged: () => void;
}) {
  const [entering, setEntering] = useState(false);
  const [signedInId, setSignedInId] = useState<number | null>(null);

  // asked for only now, when the panel opens; a failed answer just means "not your account"
  useEffect(() => {
    let alive = true;
    void getSignedInAccountId().then((id) => {
      if (alive) setSignedInId(id);
    });
    return () => {
      alive = false;
    };
  }, []);

  const isOwn = signedInId !== null && signedInId === account.id;
  // the server's own rule (billing.views_platform._cannot_enter): a turned-off
  // or deleted account cannot be entered — a greyed button says why, instead
  // of an error after the reason. One whose e-mail is not verified yet can.
  const canEnter = !!account.workspace && !isPlatformAdmin(account)
    && account.status !== 'deleted' && account.status !== 'suspended';
  // why the button is greyed out — the first reason that applies
  const enterHint = !account.workspace
    ? 'This account is not in a workspace, so there is nothing to open.'
    : isPlatformAdmin(account)
      ? 'Platform admin accounts cannot be opened this way.'
      : account.status === 'deleted'
        ? 'This account was deleted, so its workspace cannot be opened.'
        : account.status === 'suspended'
          ? 'This account is turned off, so its workspace cannot be opened.'
          : null;

  // The panel's own Close button is also its LAST control. That matters for
  // the dialogs opened inside it: the panel's focus loop works in page order,
  // so a dialog that came last would let Tab slip out to the panel behind it.
  return (
    <Drawer
      title={displayName(account)}
      subtitle={account.email}
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <section className="drawer-section" style={{ marginTop: 0 }}>
        <h3 className="pf-h2">Account</h3>
        <dl className="pf-dl">
          <dt>Email</dt>
          <dd>{account.email}</dd>
          <dt>Username</dt>
          <dd>{account.username || '—'}</dd>
          <dt>Company</dt>
          <dd>{account.workspace?.name ?? '—'}</dd>
          <dt>Role</dt>
          <dd>{ROLE_LABELS[account.role]}</dd>
          <dt>Plan</dt>
          <dd>{account.plan ?? '—'}</dd>
          <dt>Status</dt>
          <dd>
            <StatusChip status={account.status} />
          </dd>
          <dt>Two-factor</dt>
          <dd>{account.two_factor ? 'On' : 'Off'}</dd>
          <dt>Last sign-in</dt>
          <dd>{fmtRelative(account.last_login)}</dd>
          <dt>Signed up</dt>
          <dd>{when(account.joined)}</dd>
          {account.status === 'deleted' && (
            <>
              <dt>Deleted</dt>
              <dd>
                {when(account.deleted_at)}
                {account.deleted_by ? ` by ${account.deleted_by}` : ''}
              </dd>
            </>
          )}
        </dl>

        {isOwn ? (
          <p className="field-hint" style={{ marginTop: 0 }}>
            This is the account you are signed in with.
          </p>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={!canEnter} onClick={() => setEntering(true)}>
              Enter workspace as this user
            </button>
            {enterHint && (
              <p className="field-hint" style={{ marginTop: 6, marginBottom: 0 }}>
                {enterHint}
              </p>
            )}
          </div>
        )}
        {/* "Delete account" — the sign-in itself, not only its warmup copy — comes in a later piece. It goes here. */}
        {entering && <EnterWorkspaceDialog account={account} onClose={() => setEntering(false)} />}
      </section>

      {warmup && <WarmupBlock warmup={warmup} demo={demo} onChanged={onChanged} />}
    </Drawer>
  );
}
