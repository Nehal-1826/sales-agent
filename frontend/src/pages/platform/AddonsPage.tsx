/**
 * Platform Add-ons catalogue (ported from the WarmPulse admin console,
 * restyled to the merged shell). Super-admin only.
 *
 * Cards mirror the client billing Add-ons section: each add-on is editable
 * (name, price, description, display order, active); new add-ons via the
 * Create dialog. All calls go through lib/platformAdmin — no mock data.
 */
import { useState } from 'react';
import { Modal } from '../../components/overlay';
import { Field, PageHeader, Toggle } from '../../components/ui';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { createAdminAddon, listAdminAddons, updateAdminAddon } from '../../lib/platformAdmin';
import type { AddonRow } from '../../lib/platformAdmin';

interface EditState {
  id: string | null; // null = create
  key: string;
  name: string;
  description: string;
  price: string;
  sort: string;
  is_active: boolean;
}

const EMPTY: EditState = { id: null, key: '', name: '', description: '', price: '', sort: '0', is_active: true };

function AddonDialog({
  initial,
  demo,
  onClose,
  onSaved,
}: {
  initial: EditState;
  demo: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Mounted only while open and keyed by target id, so `initial` is the source
  // of truth — no stale-form syncing needed.
  const [form, setForm] = useState<EditState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isCreate = initial.id == null;

  const price = Number(form.price);
  const sort = Number(form.sort);
  const nameBad = form.name.trim() === '';
  const priceBad = !Number.isFinite(price) || price < 0 || form.price.trim() === '';
  const keyBad = isCreate && form.key.trim() === '';

  async function save() {
    setBusy(true);
    setError('');
    const r = isCreate
      ? await createAdminAddon({
          key: form.key.trim(),
          name: form.name.trim(),
          description: form.description,
          price_cents: Math.round(price * 100),
          sort_order: Number.isFinite(sort) ? sort : 0,
          is_active: form.is_active,
        })
      : await updateAdminAddon(form.id as string, {
          name: form.name.trim(),
          description: form.description,
          price_cents: Math.round(price * 100),
          sort_order: Number.isFinite(sort) ? sort : 0,
          is_active: form.is_active,
        });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(isCreate ? 'Add-on created.' : 'Add-on saved.');
    onSaved();
  }

  return (
    <Modal
      title={isCreate ? 'New add-on' : `Edit ${initial.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || demo || nameBad || priceBad || keyBad} onClick={() => void save()}>
            {busy ? 'Saving…' : isCreate ? 'Create' : 'Save'}
          </button>
        </>
      }
    >
      {demo && <p role="note">Demo data is read-only.</p>}
      {isCreate && (
        <Field label="Key (unique, lowercase)" hint="Stable identifier, e.g. extra_seats">
          <input value={form.key} placeholder="extra_seats" onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
        </Field>
      )}
      <Field label="Name">
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </Field>
      <Field label="Description">
        <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </Field>
      <div className="pf-grid">
        <Field label="Price / mo (INR)">
          <input type="number" min={0} inputMode="numeric" value={form.price} placeholder="299" onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
        </Field>
        <Field label="Display order">
          <input type="number" inputMode="numeric" value={form.sort} onChange={(e) => setForm((f) => ({ ...f, sort: e.target.value }))} />
        </Field>
      </div>
      <div className="pf-actions">
        <Toggle checked={form.is_active} onChange={(next) => setForm((f) => ({ ...f, is_active: next }))} label="Active" />
        <small>{form.is_active ? 'Shown to clients' : 'Hidden from clients'}</small>
      </div>
      {error && (
        <p className="pf-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

export function AddonsPage({ demo = false }: { demo?: boolean }) {
  const addons = useAsync(listAdminAddons);
  const [edit, setEdit] = useState<EditState | null>(null);

  const rows: AddonRow[] = addons.data ?? [];

  async function toggleActive(a: AddonRow) {
    const r = await updateAdminAddon(a.id, { is_active: !a.is_active });
    if (!r.ok) return toast.error(r.error);
    void addons.reload();
  }

  return (
    <>
      <PageHeader
        title="Add-ons"
        subtitle="Purchasable extras shown on every client's Billing page · dummy gateway."
        actions={
          <button className="btn btn-primary" onClick={() => setEdit({ ...EMPTY })}>
            Add add-on
          </button>
        }
      />

      {addons.error && <LoadError message={addons.error} onRetry={() => void addons.reload()} />}
      {!addons.data && !addons.error && <Skeleton rows={4} />}
      {addons.data && rows.length === 0 && (
        <EmptyState title="No add-ons yet">Create your first one.</EmptyState>
      )}
      {addons.data && rows.length > 0 && (
        <div className="pf-kpis" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {rows.map((a) => (
            <section key={a.id} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: a.is_active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-3)' }}>
                    {a.key} · order {a.sort_order}
                  </div>
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-2)' }}>₹{(a.price_cents / 100).toFixed(0)}/mo</span>
              </div>
              <p style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{a.description || '—'}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button type="button" className={`chip chip-${a.is_active ? 'accent' : ''}`} onClick={() => void toggleActive(a)} disabled={demo} title={demo ? 'Demo data is read-only.' : undefined}>
                  {a.is_active ? 'Active' : 'Inactive'}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    setEdit({
                      id: a.id,
                      key: a.key,
                      name: a.name,
                      description: a.description,
                      price: String(a.price_cents / 100),
                      sort: String(a.sort_order),
                      is_active: a.is_active,
                    })
                  }
                >
                  Edit
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

      {edit && (
        <AddonDialog
          key={edit.id ?? 'new'}
          initial={edit}
          demo={demo}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void addons.reload();
          }}
        />
      )}
    </>
  );
}

export default AddonsPage;
