/**
 * /admin/addons — manage the purchasable add-on catalogue (super_admin).
 *
 * Cards mirror the client billing Add-ons section. Each add-on is editable
 * (name, price, description, display order, active); new add-ons via the
 * Create dialog. All hooks are real (useAdminAddons/useCreateAddon/
 * useUpdateAddon) — no mock data.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Pencil, Plus, X } from 'lucide-react';
import {
  useAdminAddons,
  useCreateAddon,
  useUpdateAddon,
} from '@/features/admin/api';
import type { AddonRow } from '@/features/admin/types';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';

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
  onClose,
  onSave,
  saving,
}: {
  initial: EditState;
  onClose: () => void;
  onSave: (s: EditState) => void;
  saving: boolean;
}) {
  // Mounted only while open and keyed by target id, so `initial` is the source
  // of truth — no stale-form syncing needed.
  const [form, setForm] = useState<EditState>(initial);
  const isCreate = initial.id == null;

  return (
    <AppDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>{isCreate ? 'New add-on' : `Edit ${initial.name}`}</AppDialogTitle>
          <AppDialogDescription>
            Add-ons are charged via the dummy gateway. Price is INR/month.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody className="space-y-3">
          {isCreate && (
            <FormField label="Key (unique, lowercase)" htmlFor="ad-key" required>
              <Input id="ad-key" value={form.key} placeholder="extra_seats"
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
            </FormField>
          )}
          <FormField label="Name" htmlFor="ad-name" required>
            <Input id="ad-name" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Description" htmlFor="ad-desc">
            <textarea id="ad-desc" value={form.description}
              className="w-full min-h-[80px] rounded-lg border border-border-muted bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Price / mo (INR)" htmlFor="ad-price" required>
              <Input id="ad-price" type="number" inputMode="numeric" value={form.price} placeholder="299"
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            </FormField>
            <FormField label="Display order" htmlFor="ad-sort">
              <Input id="ad-sort" type="number" inputMode="numeric" value={form.sort}
                onChange={(e) => setForm((f) => ({ ...f, sort: e.target.value }))} />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active (shown to clients)
          </label>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving}>
            {saving ? 'Saving…' : isCreate ? 'Create' : 'Save'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export function AddonsPage() {
  const addons = useAdminAddons();
  const createMut = useCreateAddon();
  const updateMut = useUpdateAddon();
  const [edit, setEdit] = useState<EditState | null>(null);

  const rows: AddonRow[] = addons.data ?? [];

  const handleSave = async (s: EditState) => {
    const price = Number(s.price);
    const sort = Number(s.sort);
    if (!s.name.trim()) { toast.error('Name is required.'); return; }
    if (!Number.isFinite(price) || price < 0) { toast.error('Price must be a non-negative number.'); return; }
    try {
      if (s.id == null) {
        if (!s.key.trim()) { toast.error('Key is required.'); return; }
        await createMut.mutateAsync({
          key: s.key.trim(), name: s.name.trim(), description: s.description,
          price_cents: Math.round(price * 100), sort_order: Number.isFinite(sort) ? sort : 0,
          is_active: s.is_active,
        });
        toast.success('Add-on created.');
      } else {
        await updateMut.mutateAsync({
          id: s.id,
          payload: {
            name: s.name.trim(), description: s.description,
            price_cents: Math.round(price * 100), sort_order: Number.isFinite(sort) ? sort : 0,
            is_active: s.is_active,
          },
        });
        toast.success('Add-on saved.');
      }
      setEdit(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Save failed.'));
    }
  };

  const toggleActive = async (a: AddonRow) => {
    try {
      await updateMut.mutateAsync({ id: a.id, payload: { is_active: !a.is_active } });
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not change status.'));
    }
  };

  return (
    <div className="min-h-screen space-y-6 p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Add-ons</h1>
          <p className="text-xs text-text-dim">Purchasable extras shown on every client's Billing page · dummy gateway.</p>
        </div>
        <Button onClick={() => setEdit({ ...EMPTY })}>
          <Plus className="h-4 w-4" /> Add add-on
        </Button>
      </header>

      {addons.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-dim">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading add-ons…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-10 text-center text-sm text-text-dim">
          No add-ons yet. Create your first one.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((a) => (
            <motion.div
              key={a.id}
              layout
              className="flex flex-col gap-3 rounded-2xl border border-border-muted bg-surface-2/40 p-5"
              style={{ opacity: a.is_active ? 1 : 0.6 }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-text">{a.name}</div>
                  <div className="font-mono text-[11px] text-text-faint">{a.key} · order {a.sort_order}</div>
                </div>
                <span className="font-mono text-xs text-text-dim">₹{(a.price_cents / 100).toFixed(0)}/mo</span>
              </div>
              <p className="flex-1 text-xs text-text-dim">{a.description || '—'}</p>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => toggleActive(a)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    a.is_active ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-dim'
                  }`}
                >
                  {a.is_active ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {a.is_active ? 'Active' : 'Inactive'}
                </button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setEdit({
                      id: a.id, key: a.key, name: a.name, description: a.description,
                      price: String(a.price_cents / 100), sort: String(a.sort_order), is_active: a.is_active,
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {edit && (
        <AddonDialog
          key={edit.id ?? 'new'}
          initial={edit}
          onClose={() => setEdit(null)}
          onSave={handleSave}
          saving={createMut.isPending || updateMut.isPending}
        />
      )}
    </div>
  );
}

export default AddonsPage;
