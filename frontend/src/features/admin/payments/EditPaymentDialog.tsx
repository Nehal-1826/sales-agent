/**
 * EditPaymentDialog — shared super-admin edit control for a single payment.
 *
 * Editable fields (matching PATCH /api/admin/payments/:id):
 *   • status   — select from the 4 enum values
 *   • amount   — rupee input (₹); converted to/from amount_cents on the wire
 *
 * Usage:
 *   <EditPaymentDialog
 *     payment={someAdminPayment}
 *     open={isOpen}
 *     onOpenChange={setIsOpen}
 *   />
 */
import { useState, useEffect, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CreditCard, Loader2, CheckCircle2, AlertTriangle, RotateCcw, Clock } from 'lucide-react';
import { useUpdatePayment } from '@/features/admin/api';
import { PAYMENT_STATUSES } from '@/features/admin/types';
import type { AdminPayment, PaymentStatus } from '@/features/admin/types';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';

// ─── Design tokens (warm Aurora Glass) ──────────────────────────────────────
const T = {
  text:        '#ffffff' as const,
  dim:         'rgba(255,255,255,0.62)' as const,
  faint:       'rgba(255,255,255,0.38)' as const,
  ghost:       'rgba(255,255,255,0.18)' as const,
  hairline:    'rgba(255,255,255,0.08)' as const,
  accent:      '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim:   'rgba(242,101,34,0.18)' as const,
  success:     '#3ddc97' as const,
  successDim:  'rgba(61,220,151,0.14)' as const,
  danger:      '#ff5c7a' as const,
  dangerDim:   'rgba(255,92,122,0.14)' as const,
  warning:     '#FF8A4B' as const,
  warningDim:  'rgba(255,138,75,0.14)' as const,
  neutral:     'rgba(255,255,255,0.28)' as const,
  neutralDim:  'rgba(255,255,255,0.08)' as const,
};

// ─── Status helpers ──────────────────────────────────────────────────────────
function statusColor(s: PaymentStatus): string {
  if (s === 'succeeded') return T.success;
  if (s === 'refunded')  return T.accent;
  if (s === 'pending')   return T.warning;
  return T.danger;
}
function statusIcon(s: PaymentStatus) {
  if (s === 'succeeded') return <CheckCircle2 size={13} />;
  if (s === 'refunded')  return <RotateCcw size={13} />;
  if (s === 'pending')   return <Clock size={13} />;
  return <AlertTriangle size={13} />;
}
function statusLabel(s: PaymentStatus): string {
  if (s === 'succeeded') return 'Succeeded';
  if (s === 'refunded')  return 'Refunded';
  if (s === 'pending')   return 'Pending';
  return 'Failed';
}

// ─── Overlay / dialog variants ───────────────────────────────────────────────
const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.62)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  zIndex: 9000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

interface EditPaymentDialogProps {
  payment: AdminPayment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Converts amount_usd (float) to a clean rupee string for the input.
 * E.g. 1299.00 → "1299" (no trailing zeros for whole numbers).
 */
function amountUsdToRupeeStr(amountUsd: number): string {
  // amount_usd is already in rupees (the frontend maps amount_cents/100 → amount_usd).
  const v = amountUsd;
  // If it's a whole number, skip the decimal.
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}

export function EditPaymentDialog({ payment, open, onOpenChange }: EditPaymentDialogProps) {
  const { money, date } = useLocaleFormat();
  const updatePayment = useUpdatePayment();

  const [status,      setStatus]      = useState<PaymentStatus>(payment.status);
  const [rupeeStr,    setRupeeStr]    = useState(() => amountUsdToRupeeStr(payment.amount_usd));
  const [rupeeError,  setRupeeError]  = useState('');

  // Reset form when payment changes or dialog re-opens.
  useEffect(() => {
    if (open) {
      setStatus(payment.status);
      setRupeeStr(amountUsdToRupeeStr(payment.amount_usd));
      setRupeeError('');
    }
  }, [open, payment.id, payment.status, payment.amount_usd]);

  function validateRupees(raw: string): number | null {
    const v = parseFloat(raw);
    if (Number.isNaN(v) || v < 0) return null;
    // ₹ amounts shouldn't exceed a sane ceiling (1 Cr = 1,00,00,000 paise max).
    if (v > 1_00_00_000) return null;
    return v;
  }

  function handleRupeeChange(raw: string) {
    setRupeeStr(raw);
    if (raw === '') { setRupeeError(''); return; }
    if (validateRupees(raw) === null) {
      setRupeeError('Enter a valid non-negative amount (₹).');
    } else {
      setRupeeError('');
    }
  }

  async function handleSave() {
    const rupeeVal = validateRupees(rupeeStr);
    if (rupeeStr !== '' && rupeeVal === null) {
      setRupeeError('Enter a valid non-negative amount (₹).');
      return;
    }

    const statusChanged = status !== payment.status;
    const amountChanged = rupeeVal !== null && Math.round(rupeeVal * 100) !== Math.round(payment.amount_usd * 100);

    if (!statusChanged && !amountChanged) {
      toast.info('No changes to save.');
      onOpenChange(false);
      return;
    }

    const update: { status?: PaymentStatus; amount_cents?: number } = {};
    if (statusChanged) update.status = status;
    if (amountChanged) update.amount_cents = Math.round(rupeeVal! * 100);

    try {
      await updatePayment.mutateAsync({ id: payment.id, update });
      toast.success('Payment updated.');
      onOpenChange(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to update payment.'));
    }
  }

  function handleClose() {
    if (!updatePayment.isPending) onOpenChange(false);
  }

  const inputBase: CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid rgba(255,255,255,0.12)`,
    color: T.text,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="edit-payment-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={overlayStyle}
          onClick={handleClose}
        >
          <motion.div
            key="edit-payment-dialog"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              background: 'rgba(14,12,20,0.97)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 18,
              backdropFilter: 'blur(32px)',
              WebkitBackdropFilter: 'blur(32px)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(242,101,34,0.12)',
              overflow: 'hidden',
            }}
          >
            {/* Accent top strip */}
            <div style={{
              height: 3,
              background: `linear-gradient(90deg, transparent, ${T.accent}, ${T.accentLight}, transparent)`,
            }} />

            {/* Header */}
            <div style={{
              padding: '20px 22px 16px',
              borderBottom: `1px solid ${T.hairline}`,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: T.accentDim,
                  border: `1px solid ${T.accent}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: T.accentLight, flexShrink: 0,
                }}>
                  <CreditCard size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Edit Payment</div>
                  <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>
                    {payment.user_email || 'Unknown user'} · {date(payment.created_at)}
                  </div>
                </div>
              </div>
              <motion.button
                onClick={handleClose}
                whileHover={{ scale: 1.12, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                disabled={updatePayment.isPending}
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: T.ghost, border: `1px solid ${T.hairline}`,
                  color: T.dim, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <X size={13} />
              </motion.button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Current state summary */}
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${T.hairline}`,
                borderRadius: 10, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: 12, color: T.faint }}>Current:</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 12, fontWeight: 600,
                  color: statusColor(payment.status),
                }}>
                  {statusIcon(payment.status)}
                  {statusLabel(payment.status)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                  {money(payment.amount_usd)}
                </span>
                {payment.plan && (
                  <span style={{ fontSize: 11, color: T.faint }}>· {payment.plan}</span>
                )}
              </div>

              {/* Status select */}
              <div>
                <label style={{ fontSize: 12, color: T.dim, fontWeight: 600, letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
                  STATUS
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PAYMENT_STATUSES.map((s) => {
                    const c = statusColor(s);
                    const active = status === s;
                    return (
                      <motion.button
                        key={s}
                        onClick={() => setStatus(s)}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                          fontSize: 12, fontWeight: 600,
                          background: active ? `${c}18` : 'transparent',
                          border: `1px solid ${active ? c + '60' : 'rgba(255,255,255,0.10)'}`,
                          color: active ? c : T.dim,
                          transition: 'all 0.15s',
                        }}
                      >
                        {statusIcon(s)}
                        {statusLabel(s)}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Amount (₹) input */}
              <div>
                <label style={{ fontSize: 12, color: T.dim, fontWeight: 600, letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
                  AMOUNT (₹)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 14, color: T.faint, pointerEvents: 'none', fontWeight: 700,
                  }}>₹</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={rupeeStr}
                    onChange={(e) => handleRupeeChange(e.target.value)}
                    style={{
                      ...inputBase,
                      paddingLeft: 26,
                      border: `1px solid ${rupeeError ? T.danger + '60' : 'rgba(255,255,255,0.12)'}`,
                    }}
                    placeholder="e.g. 999"
                  />
                </div>
                {rupeeError && (
                  <div style={{ fontSize: 11, color: T.danger, marginTop: 5 }}>{rupeeError}</div>
                )}
                <div style={{ fontSize: 11, color: T.faint, marginTop: 5 }}>
                  Stored as paise (cents) on the wire — {rupeeStr && validateRupees(rupeeStr) !== null
                    ? `${Math.round(validateRupees(rupeeStr)! * 100)} paise`
                    : '—'}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 22px 18px',
              borderTop: `1px solid ${T.hairline}`,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
            }}>
              <motion.button
                onClick={handleClose}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                disabled={updatePayment.isPending}
                style={{
                  padding: '8px 16px', borderRadius: 9,
                  background: 'transparent',
                  border: `1px solid rgba(255,255,255,0.12)`,
                  color: T.dim, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  opacity: updatePayment.isPending ? 0.5 : 1,
                }}
              >
                Cancel
              </motion.button>
              <motion.button
                onClick={handleSave}
                whileHover={updatePayment.isPending ? {} : { scale: 1.04, boxShadow: `0 0 18px ${T.accentDim}` }}
                whileTap={updatePayment.isPending ? {} : { scale: 0.97 }}
                disabled={updatePayment.isPending || !!rupeeError}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 18px', borderRadius: 9,
                  background: updatePayment.isPending ? T.accentDim : `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                  border: 'none',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: updatePayment.isPending || !!rupeeError ? 'not-allowed' : 'pointer',
                  opacity: !!rupeeError ? 0.6 : 1,
                }}
              >
                {updatePayment.isPending
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                  : 'Save changes'}
              </motion.button>
            </div>
          </motion.div>

          {/* Spinner keyframes */}
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
