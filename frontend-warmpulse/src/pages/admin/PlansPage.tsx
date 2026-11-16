/**
 * /admin/plans — PL2 Comparison Matrix (live data)
 *
 * Visual design: plans as columns × feature/limit rows, framer-motion spring
 * column hover-lift + dim-others, AnimatePresence add/remove columns, staggered
 * row entrance, animated KPI counters.
 *
 * Data: real hooks only — useAdminPlans, useUpdatePlan, useCreatePlan,
 * useDeletePlan, useAdminPlanDistribution. No mock data, no Math.random,
 * no fabricated fields.
 *
 * Palette: Aurora Glass — #F26522/#FF8A4B accent, #3ddc97 success, #ff5c7a
 * danger. No purple/violet/blue/teal/cyan/indigo/pink.
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  Check,
  X,
  Plus,
  Trash2,
  Star,
  Edit2,
  Layers,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  useAdminPlans,
  useUpdatePlan,
  useCreatePlan,
  useDeletePlan,
  useAdminPlanDistribution,
} from '@/features/admin/api';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';
import type { PlanRow, PlanDistributionRow } from '@/features/admin/types';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { formatMoney, formatNumber } from '@/lib/format';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';

// ─── CSV export column spec ───────────────────────────────────────────────────
const PLANS_EXPORT_COLUMNS: CsvColumn<PlanRow>[] = [
  { header: 'Name', value: (p) => p.name },
  { header: 'Slug', value: (p) => p.slug },
  { header: 'Billing Interval', value: () => 'monthly' },
  { header: 'Price (USD/mo)', value: (p) => p.price_monthly_usd },
  { header: 'Mailboxes Included', value: (p) => p.mailboxes_included },
  { header: 'Max Mailboxes', value: (p) => p.max_mailboxes },
  { header: 'Daily Email Cap', value: (p) => p.daily_email_cap ?? '' },
  { header: 'LLM Token Cap', value: (p) => p.llm_token_cap ?? '' },
  { header: 'Active', value: (p) => p.is_active },
  { header: 'Public', value: (p) => p.is_public },
  { header: 'Features', value: (p) => (p.features ?? []).join('; ') },
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.40)' as const,
  ghost: 'rgba(255,255,255,0.22)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim: 'rgba(242,101,34,0.18)' as const,
  accentGlow: 'rgba(242,101,34,0.40)' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.14)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.13)' as const,
  warning: '#FF8A4B' as const,
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 16,
  } as CSSProperties,
  glassTight: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius: 10,
  } as CSSProperties,
  glassDeep: {
    background: 'rgba(255,255,255,0.075)',
    border: '1px solid rgba(255,255,255,0.13)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: 22,
  } as CSSProperties,
};

// ─── Framer-motion variants ───────────────────────────────────────────────────
const columnVariants: Variants = {
  hidden: { opacity: 0, y: 40, scaleY: 0.88, originY: 0 },
  visible: {
    opacity: 1,
    y: 0,
    scaleY: 1,
    transition: { type: 'spring', stiffness: 260, damping: 22 },
  },
  exit: {
    opacity: 0,
    scaleY: 0.85,
    y: -20,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as [number, number, number, number] },
  },
};

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

// ─── Animated counter hook ────────────────────────────────────────────────────
function useAnimCounter(target: number, duration = 1.1, isMoney = false): string {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const ctrl = animate(mv, target, {
      duration,
      ease: [0.25, 0.1, 0.25, 1],
    });
    const unsub = mv.on('change', (v) => setDisplay(Math.round(v)));
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [target, duration, mv]);

  if (isMoney) return formatMoney(display);
  return formatNumber(display);
}

// ─── Animated subscriber / MRR cells ─────────────────────────────────────────
function AnimNum({ value, isMoney }: { value: number; isMoney?: boolean }) {
  const display = useAnimCounter(value, 1.0, isMoney);
  return (
    <span style={{ fontSize: 14, fontWeight: 700, color: isMoney ? T.accent : T.dim, fontVariantNumeric: 'tabular-nums' }}>
      {display}
    </span>
  );
}

// ─── Inline editable number cell ──────────────────────────────────────────────
function EditableNumber({
  value,
  onCommit,
  prefix,
  suffix,
  highlight,
  nullable,
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  highlight?: boolean;
  nullable?: boolean; // when true, empty string → null
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    if (nullable && draft.trim() === '') {
      onCommit(null);
    } else {
      const n = parseInt(draft, 10);
      if (!isNaN(n) && n >= 0) onCommit(n);
      else setDraft(value != null ? String(value) : '');
    }
    setEditing(false);
  }, [draft, nullable, onCommit, value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const displayStr =
    value == null ? '—' : prefix === '$'
      ? `${formatMoney(value)}${suffix ?? ''}`
      : `${prefix ?? ''}${formatNumber(value)}${suffix ?? ''}`;
  const displayColor = value == null ? T.ghost : highlight ? T.text : T.dim;

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        min={0}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value != null ? String(value) : ''); setEditing(false); }
        }}
        style={{
          width: '100%',
          background: 'rgba(242,101,34,0.12)',
          border: '1px solid rgba(242,101,34,0.50)',
          borderRadius: 8,
          color: T.accent,
          fontSize: 14,
          fontWeight: 700,
          padding: '4px 8px',
          outline: 'none',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      />
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => { setDraft(value != null ? String(value) : ''); setEditing(true); }}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: displayColor,
        fontSize: 14,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 8px',
        borderRadius: 6,
        fontVariantNumeric: 'tabular-nums',
        width: '100%',
        justifyContent: 'center',
      }}
      title="Click to edit"
    >
      {displayStr}
      <Edit2 size={10} style={{ color: T.ghost, flexShrink: 0, opacity: 0.7 }} />
    </motion.button>
  );
}

// ─── Editable plan name ───────────────────────────────────────────────────────
function EditableName({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) onCommit(trimmed);
    else setDraft(value);
    setEditing(false);
  }, [draft, onCommit, value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={32}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        style={{
          background: 'rgba(242,101,34,0.10)',
          border: '1px solid rgba(242,101,34,0.40)',
          borderRadius: 8,
          color: T.accent,
          fontSize: 15,
          fontWeight: 800,
          padding: '4px 10px',
          outline: 'none',
          textAlign: 'center',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => { setDraft(value); setEditing(true); }}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: T.text,
        fontSize: 15,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        justifyContent: 'center',
        padding: '4px 8px',
        borderRadius: 6,
        width: '100%',
      }}
      title="Click to rename"
    >
      {value}
      <Edit2 size={10} style={{ color: T.ghost, opacity: 0.6 }} />
    </motion.button>
  );
}

// ─── Active toggle cell ───────────────────────────────────────────────────────
function ActiveCell({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.10 }}
      whileTap={{ scale: 0.88 }}
      onClick={() => onChange(!value)}
      style={{
        background: value ? T.successDim : T.dangerDim,
        border: `1px solid ${value ? 'rgba(61,220,151,0.30)' : 'rgba(255,92,122,0.25)'}`,
        borderRadius: 8,
        width: 34,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
      title={value ? 'Active — click to deactivate' : 'Inactive — click to activate'}
    >
      <motion.div
        key={String(value)}
        initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      >
        {value
          ? <Check size={16} color={T.success} />
          : <X size={16} color={T.danger} />
        }
      </motion.div>
    </motion.button>
  );
}

// ─── Delete confirm overlay ───────────────────────────────────────────────────
function DeleteConfirmModal({
  planName,
  onConfirm,
  onCancel,
  deleting,
}: {
  planName: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <>
      <motion.div
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 900,
          background: 'rgba(8,5,3,0.72)',
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.90, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.90, y: 10 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 910,
          ...T.glassDeep,
          padding: '32px 36px',
          textAlign: 'center',
          minWidth: 320,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: T.dangerDim,
            border: '1px solid rgba(255,92,122,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px',
          }}
        >
          <Trash2 size={22} color={T.danger} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginBottom: 8 }}>
          Delete "{planName}"?
        </div>
        <div style={{ fontSize: 13, color: T.faint, marginBottom: 24, lineHeight: 1.5 }}>
          Soft-deletes the plan — existing subscribers stay billed<br />at their current rate. Disappears from new sign-ups.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onCancel}
            disabled={deleting}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: T.dim,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: '0 0 24px rgba(255,92,122,0.35)' }}
            whileTap={{ scale: 0.96 }}
            onClick={onConfirm}
            disabled={deleting}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              background: T.dangerDim,
              border: '1px solid rgba(255,92,122,0.40)',
              color: T.danger,
              fontSize: 13,
              fontWeight: 700,
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            {deleting && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
            Delete Plan
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}

// ─── Edit-plan dialog (features + all fields) ─────────────────────────────────
function EditPlanDialog({
  plan,
  onClose,
  onSave,
  saving,
}: {
  plan: PlanRow | null;
  onClose: () => void;
  onSave: (id: string, payload: Partial<PlanRow>) => void | Promise<void>;
  saving: boolean;
}) {
  const open = plan !== null;
  const [form, setForm] = useState({
    name: '',
    price: '',
    mailboxes: '',
    max: '',
    dailyCap: '',
    tokens: '',
    features: '',
  });

  if (open && form.name === '' && plan) {
    setForm({
      name: plan.name,
      price: String(plan.price_monthly_usd),
      mailboxes: String(plan.mailboxes_included),
      max: String(plan.max_mailboxes),
      dailyCap: plan.daily_email_cap != null ? String(plan.daily_email_cap) : '',
      tokens: plan.llm_token_cap != null ? String(plan.llm_token_cap) : '',
      features: (plan.features ?? []).join('\n'),
    });
  }

  function handleSubmit() {
    if (!plan) return;
    const price = Number(form.price);
    const max = Number(form.max);
    const dailyCap = form.dailyCap.trim() === '' ? undefined : Number(form.dailyCap);
    const tokens = form.tokens.trim() === '' ? undefined : Number(form.tokens);
    const features = form.features.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!Number.isFinite(price) || !Number.isFinite(max)) {
      toast.error('Price / mailboxes must be numbers.');
      return;
    }
    if (dailyCap != null && (!Number.isFinite(dailyCap) || dailyCap < 1)) {
      toast.error('Daily cap must be ≥ 1.');
      return;
    }
    const payload: Partial<PlanRow> = {
      name: form.name,
      price_monthly_usd: price,
      max_mailboxes: max,
      features,
    };
    if (dailyCap != null) payload.daily_email_cap = dailyCap;
    if (tokens != null && Number.isFinite(tokens) && tokens > 0) payload.llm_token_cap = tokens;
    void onSave(plan.id, payload);
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setForm({ name: '', price: '', mailboxes: '', max: '', dailyCap: '', tokens: '', features: '' });
          onClose();
        }
      }}
    >
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Edit {plan?.name}</AppDialogTitle>
          <AppDialogDescription>
            Changes apply to new subscriptions and the next renewal cycle for existing ones.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody className="space-y-3">
          <FormField label="Name" htmlFor="ep-name">
            <Input id="ep-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Price / mo (INR)" htmlFor="ep-price">
              <Input id="ep-price" type="number" inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            </FormField>
            <FormField label="Mailboxes" htmlFor="ep-max">
              <Input id="ep-max" type="number" inputMode="numeric" value={form.max} onChange={(e) => setForm((f) => ({ ...f, max: e.target.value }))} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Daily warmup cap / mailbox" htmlFor="ep-daily">
              <Input id="ep-daily" type="number" inputMode="numeric" value={form.dailyCap} onChange={(e) => setForm((f) => ({ ...f, dailyCap: e.target.value }))} placeholder="50" />
            </FormField>
            <FormField label="AI tokens / mo (blank = no cap)" htmlFor="ep-tokens">
              <Input id="ep-tokens" type="number" inputMode="numeric" value={form.tokens} onChange={(e) => setForm((f) => ({ ...f, tokens: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Features (one per line)" htmlFor="ep-features">
            <textarea
              id="ep-features"
              className="w-full min-h-[140px] rounded-lg border border-border-muted bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
              value={form.features}
              onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
            />
          </FormField>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

// ─── Create-plan dialog ───────────────────────────────────────────────────────
function CreatePlanDialog({
  open,
  onClose,
  onCreate,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: Partial<PlanRow>) => void | Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    name: '',
    price: '',
    mailboxes: '',
    max: '',
    dailyCap: '',
    tokens: '',
    features: 'Warmup engine\nDefault peer pool\nDNS validator',
  });

  function reset() {
    setForm({ name: '', price: '', mailboxes: '', max: '', dailyCap: '', tokens: '', features: 'Warmup engine\nDefault peer pool\nDNS validator' });
  }

  function handleSubmit() {
    const trimmedName = form.name.trim();
    if (!trimmedName) { toast.error('Name is required.'); return; }
    const price = Number(form.price);
    const max = Number(form.max);
    const dailyCap = form.dailyCap.trim() === '' ? undefined : Number(form.dailyCap);
    const tokens = form.tokens.trim() === '' ? undefined : Number(form.tokens);
    if (!Number.isFinite(price) || price < 0) { toast.error('Price must be a non-negative number.'); return; }
    if (!Number.isFinite(max) || max < 1) { toast.error('Mailboxes must be at least 1.'); return; }
    if (dailyCap != null && (!Number.isFinite(dailyCap) || dailyCap < 1)) { toast.error('Daily cap must be ≥ 1.'); return; }
    const features = form.features.split('\n').map((l) => l.trim()).filter(Boolean);
    const payload: Partial<PlanRow> = { name: trimmedName, price_monthly_usd: price, max_mailboxes: max, features, is_active: true };
    if (dailyCap != null) payload.daily_email_cap = dailyCap;
    if (tokens != null && Number.isFinite(tokens) && tokens > 0) payload.llm_token_cap = tokens;
    void onCreate(payload);
  }

  return (
    <AppDialog open={open} onOpenChange={(next) => { if (!next) { reset(); onClose(); } }}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Create new plan</AppDialogTitle>
          <AppDialogDescription>Define a new pricing tier. You can edit every field later.</AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody className="space-y-3">
          <FormField label="Name" htmlFor="cp-name" required>
            <Input id="cp-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Starter, Growth, Scale…" autoFocus />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Price / mo (INR)" htmlFor="cp-price" required>
              <Input id="cp-price" type="number" inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="1500" />
            </FormField>
            <FormField label="Mailboxes" htmlFor="cp-max" required>
              <Input id="cp-max" type="number" inputMode="numeric" value={form.max} onChange={(e) => setForm((f) => ({ ...f, max: e.target.value }))} placeholder="5" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Daily warmup cap / mailbox" htmlFor="cp-daily">
              <Input id="cp-daily" type="number" inputMode="numeric" value={form.dailyCap} onChange={(e) => setForm((f) => ({ ...f, dailyCap: e.target.value }))} placeholder="50" />
            </FormField>
            <FormField label="AI tokens / mo (blank = no cap)" htmlFor="cp-tokens">
              <Input id="cp-tokens" type="number" inputMode="numeric" value={form.tokens} onChange={(e) => setForm((f) => ({ ...f, tokens: e.target.value }))} placeholder="1000000" />
            </FormField>
          </div>
          <FormField label="Features (one per line)" htmlFor="cp-features">
            <textarea
              id="cp-features"
              className="w-full min-h-[120px] rounded-lg border border-border-muted bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
              value={form.features}
              onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
            />
          </FormField>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Creating…' : 'Create plan'}</Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

// ─── Per-plan column heading "recommended" toggle (local state) ───────────────
// There is no real is_recommended field — this is a purely visual admin choice
// stored in local state only. Clearly not persisted.
type RecommendedState = Record<string, boolean>;

// ─── Main page ────────────────────────────────────────────────────────────────
export function PlansPage() {
  // ── Real data hooks ──
  const plansQuery = useAdminPlans();
  const distQuery = useAdminPlanDistribution();
  const updateMut = useUpdatePlan();
  const createMut = useCreatePlan();
  const deleteMut = useDeletePlan();

  const plans: PlanRow[] = plansQuery.data ?? [];
  const distRows: PlanDistributionRow[] = distQuery.data ?? [];

  // ── Local UI state ──
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<PlanRow | null>(null);
  const [creating, setCreating] = useState(false);
  // Visual-only recommended: not persisted, clearly labelled
  const [recommended, setRecommended] = useState<RecommendedState>({});

  // ── Distribution lookup helpers ──
  function distFor(plan: PlanRow): PlanDistributionRow | undefined {
    const slug = plan.slug.toLowerCase();
    const name = plan.name.toLowerCase();
    return distRows.find(
      (d) => d.plan.toLowerCase() === slug || d.plan.toLowerCase() === name,
    );
  }

  function subsFor(plan: PlanRow): number {
    return distFor(plan)?.count ?? 0;
  }

  function mrrFor(plan: PlanRow): number {
    const dist = distFor(plan);
    if (dist?.mrr != null) return dist.mrr;
    // Derive: price × subscribers
    return plan.price_monthly_usd * subsFor(plan);
  }


  // ── Single-field update handler ──
  async function patchPlan(id: string, payload: Partial<PlanRow>) {
    try {
      await updateMut.mutateAsync({ id, payload });
      toast.success('Plan updated.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Update failed.'));
    }
  }

  // Move a plan left/right in the public ordering. `plans` arrives sorted by
  // sort_order, so we splice the row to its new index and renumber the whole
  // list to 10,20,30,… (robust against ties / gaps), patching only what changed.
  async function movePlan(plan: PlanRow, dir: -1 | 1) {
    const ordered = [...plans].sort((a, b) => a.sort_order - b.sort_order);
    const idx = ordered.findIndex((p) => p.id === plan.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const [moved] = ordered.splice(idx, 1);
    if (!moved) return;
    ordered.splice(swapIdx, 0, moved);
    try {
      await Promise.all(
        ordered
          .map((p, i) => ({ p, next: (i + 1) * 10 }))
          .filter(({ p, next }) => p.sort_order !== next)
          .map(({ p, next }) => updateMut.mutateAsync({ id: p.id, payload: { sort_order: next } })),
      );
      toast.success('Order updated.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not reorder.'));
    }
  }

  // Hide / unhide a plan from the public pricing page, sign-up and onboarding
  // (is_public). Existing subscribers keep the plan; new purchases are blocked.
  async function toggleVisibility(plan: PlanRow) {
    const hiding = plan.is_public;
    try {
      await updateMut.mutateAsync({ id: plan.id, payload: { is_public: !plan.is_public } });
      toast.success(
        hiding
          ? `${plan.name} hidden — it no longer shows on the public pricing page or sign-up.`
          : `${plan.name} is now visible to everyone.`,
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not change visibility.'));
    }
  }

  // ── Full-form save (from edit dialog) ──
  async function handleSave(id: string, payload: Partial<PlanRow>) {
    try {
      await updateMut.mutateAsync({ id, payload });
      toast.success('Plan saved.');
      setEditPlan(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Update failed.'));
    }
  }

  // ── Create ──
  async function handleCreate(payload: Partial<PlanRow>) {
    try {
      await createMut.mutateAsync(payload);
      toast.success(`Plan "${payload.name ?? 'New plan'}" created.`);
      setCreating(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not create plan.'));
    }
  }

  // ── Delete ──
  async function executeDelete() {
    if (!deleteTarget) return;
    const target = plans.find((p) => p.id === deleteTarget);
    try {
      await deleteMut.mutateAsync(deleteTarget);
      toast.success(`"${target?.name ?? 'Plan'}" deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Delete failed.'));
    }
  }

  // ── Toggle local recommended badge (visual-only, not persisted) ──
  const toggleRecommended = useCallback((id: string) => {
    setRecommended((prev) => {
      const next: RecommendedState = {};
      for (const k of Object.keys(prev)) next[k] = false;
      next[id] = !prev[id];
      return next;
    });
  }, []);


  // ── Loading state ──
  if (plansQuery.isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.faint }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} />
        Loading plans…
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '28px 28px 100px',
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
        color: T.text,
        position: 'relative',
      }}
    >
      {/* ── Page header ── */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        style={{ marginBottom: 26, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: T.accentDim,
              border: '1px solid rgba(242,101,34,0.40)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={22} color={T.accent} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: T.text }}>Plans & Pricing</h1>
            <p style={{ fontSize: 12, color: T.faint, margin: 0, marginTop: 2 }}>
              Edit each plan as a card — click any value to edit inline · real data
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ExportButton
            rows={plans}
            columns={PLANS_EXPORT_COLUMNS}
            filename={`plans-${exportStamp()}`}
          />
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: `0 0 28px ${T.accentGlow}` }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setCreating(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 12,
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 18px rgba(242,101,34,0.30)',
            }}
          >
            <Plus size={16} />
            Add Plan
          </motion.button>
        </div>
      </motion.div>

      {/* ── Empty state ── */}
      {plans.length === 0 && !plansQuery.isLoading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.faint }}>
          <Layers size={40} strokeWidth={1.4} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: T.dim, marginBottom: 6 }}>No plans configured</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Create your first pricing tier to start accepting subscriptions.</div>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => setCreating(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 12,
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`, border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            <Plus size={15} /> Create first plan
          </motion.button>
        </div>
      )}

      {/* ── Editable plan cards — every control lives on the card ── */}
      {plans.length > 0 && (
        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', alignItems: 'start' }}>
          <AnimatePresence mode="popLayout">
            {plans.map((plan, planIdx) => {
              const isRecommended = recommended[plan.id] === true;
              const isFirst = planIdx === 0;
              const isLast = planIdx === plans.length - 1;
              const hidden = plan.is_public === false;
              const iconBtn = (disabled: boolean): CSSProperties => ({
                width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1,
              });
              const fieldLabel: CSSProperties = { fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em' };
              return (
                <motion.div key={plan.id} layout variants={columnVariants} initial="hidden" animate="visible" exit="exit"
                  style={{
                    position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, padding: '24px 20px 20px',
                    borderRadius: 18, background: 'rgba(255,255,255,0.04)',
                    border: isRecommended ? '1px solid rgba(242,101,34,0.45)' : '1px solid rgba(255,255,255,0.10)',
                    boxShadow: isRecommended ? '0 0 0 1px rgba(242,101,34,0.25), 0 18px 50px rgba(242,101,34,0.12)' : 'none',
                    opacity: plan.is_active ? 1 : 0.55,
                  }}>
                  {isRecommended && (
                    <span style={{
                      position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap',
                      background: `linear-gradient(180deg, ${T.accent}, ${T.accentLight})`, color: '#fff', fontSize: 10,
                      fontWeight: 800, padding: '3px 10px', borderRadius: 999, letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}>Most popular</span>
                  )}

                  {/* action row */}
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <motion.button whileTap={{ scale: 0.9 }} disabled={isFirst} onClick={() => { if (!isFirst) void movePlan(plan, -1); }} title="Move earlier" style={iconBtn(isFirst)}><ChevronLeft size={14} color={T.ghost} /></motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} disabled={isLast} onClick={() => { if (!isLast) void movePlan(plan, 1); }} title="Move later" style={iconBtn(isLast)}><ChevronRight size={14} color={T.ghost} /></motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => toggleRecommended(plan.id)} title="Mark recommended (visual only)" style={{ ...iconBtn(false), background: isRecommended ? T.accentDim : 'rgba(255,255,255,0.06)', border: `1px solid ${isRecommended ? 'rgba(242,101,34,0.4)' : 'rgba(255,255,255,0.10)'}` }}><Star size={13} color={isRecommended ? T.accent : T.ghost} fill={isRecommended ? T.accent : 'none'} /></motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => void toggleVisibility(plan)} title={hidden ? 'Hidden — click to show on pricing page' : 'Visible — click to hide'} style={{ ...iconBtn(false), background: hidden ? T.accentDim : 'rgba(255,255,255,0.06)' }}>{hidden ? <EyeOff size={13} color={T.accent} /> : <Eye size={13} color={T.ghost} />}</motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => setDeleteTarget(plan.id)} title="Delete plan" style={iconBtn(false)}><Trash2 size={13} color={T.ghost} /></motion.button>
                  </div>

                  {/* name */}
                  <EditableName value={plan.name} onCommit={(v) => void patchPlan(plan.id, { name: v })} />

                  {/* price */}
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <EditableNumber value={plan.price_monthly_usd} prefix="$" suffix="/mo" highlight onCommit={(v) => { if (v != null) void patchPlan(plan.id, { price_monthly_usd: v }); }} />
                  </div>

                  <div style={{ height: 1, background: T.hairline }} />

                  {/* editable numeric fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={fieldLabel}>Mailboxes</span>
                      <div style={{ alignSelf: 'flex-start' }}><EditableNumber value={plan.max_mailboxes} onCommit={(v) => { if (v != null) void patchPlan(plan.id, { max_mailboxes: v }); }} /></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={fieldLabel}>Daily send cap</span>
                      <div style={{ alignSelf: 'flex-start' }}><EditableNumber value={plan.daily_email_cap ?? null} nullable onCommit={(v) => void patchPlan(plan.id, { daily_email_cap: v ?? undefined })} /></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={fieldLabel}>LLM tokens / mo</span>
                      <div style={{ alignSelf: 'flex-start' }}><EditableNumber value={plan.llm_token_cap ?? null} nullable onCommit={(v) => void patchPlan(plan.id, { llm_token_cap: v ?? undefined })} /></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={fieldLabel}>Display order</span>
                      <div style={{ alignSelf: 'flex-start' }}><EditableNumber value={plan.sort_order} onCommit={(v) => { if (v != null) void patchPlan(plan.id, { sort_order: v }); }} /></div>
                    </div>
                  </div>

                  <div style={{ height: 1, background: T.hairline }} />

                  {/* features */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={fieldLabel}>Features ({(plan.features ?? []).length})</span>
                      <motion.button whileTap={{ scale: 0.95 }} onClick={() => setEditPlan(plan)} title="Edit features & details" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, padding: '4px 9px', color: T.dim, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Edit2 size={11} color={T.ghost} />Edit</motion.button>
                    </div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(plan.features ?? []).map((feat) => (
                        <li key={feat} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: T.dim }}>
                          <Check size={13} color={T.success} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span>{feat}</span>
                        </li>
                      ))}
                      {(plan.features ?? []).length === 0 && <li style={{ fontSize: 12, color: T.ghost }}>No features yet — click Edit to add.</li>}
                    </ul>
                  </div>

                  <div style={{ height: 1, background: T.hairline }} />

                  {/* footer: active toggle + subscribers / MRR */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ActiveCell value={plan.is_active} onChange={(v) => void patchPlan(plan.id, { is_active: v })} />
                      <span style={{ fontSize: 11, color: T.faint }}>{plan.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{subsFor(plan)} subs · MRR</div>
                      <AnimNum value={mrrFor(plan)} isMoney />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Add-plan ghost card */}
          <motion.button layout whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={() => setCreating(true)}
            style={{ minHeight: 220, borderRadius: 18, border: '1px dashed rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.02)', color: T.faint, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}>
            <Plus size={22} /> <span style={{ fontSize: 13, fontWeight: 700 }}>Add plan</span>
          </motion.button>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal
            key="delete-confirm"
            planName={plans.find((p) => p.id === deleteTarget)?.name ?? 'Plan'}
            onConfirm={() => void executeDelete()}
            onCancel={() => setDeleteTarget(null)}
            deleting={deleteMut.isPending}
          />
        )}
      </AnimatePresence>

      {/* ── Edit dialog (full form) ── */}
      <EditPlanDialog
        plan={editPlan}
        onClose={() => setEditPlan(null)}
        onSave={handleSave}
        saving={updateMut.isPending}
      />

      {/* ── Create dialog ── */}
      <CreatePlanDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={handleCreate}
        saving={createMut.isPending}
      />

    </div>
  );
}

export default PlansPage;
