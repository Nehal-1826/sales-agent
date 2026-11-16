import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export interface AdminDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  /** Sticky action row at the bottom (buttons). */
  footer?: ReactNode;
  children: ReactNode;
}

export function AdminDetailDrawer({ open, onClose, eyebrow = 'Detail', footer, children }: AdminDetailDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="ag-drawer__scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="ag-drawer"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog" aria-modal="true"
          >
            <div className="ag-drawer__head">
              <span className="ag-drawer__eyebrow">{eyebrow}</span>
              <button type="button" className="ag-drawer__close" onClick={onClose} aria-label="Close"><X size={14} /></button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
            {footer && <div className="ag-drawer__footer">{footer}</div>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
