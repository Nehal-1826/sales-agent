import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned action slot (buttons, filters, etc). */
  actions?: ReactNode;
  /**
   * Alias for `actions` — some pages pass `right` instead.
   * Rendered identically when provided.
   */
  right?: ReactNode;
  className?: string;
}

/**
 * Shared header for every admin page.
 *
 * Renders a fade-in title block with optional description and right-aligned
 * actions. Keep this lightweight — all admin page-level chrome beyond the
 * header should live in the page itself.
 */
export function AdminPageHeader({
  title,
  description,
  actions,
  right,
  className,
}: AdminPageHeaderProps) {
  const rightSlot = actions ?? right;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn('flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between', className)}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
        {description ? <p className="text-sm text-text-dim">{description}</p> : null}
      </div>
      {rightSlot ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{rightSlot}</div>
      ) : null}
    </motion.div>
  );
}
