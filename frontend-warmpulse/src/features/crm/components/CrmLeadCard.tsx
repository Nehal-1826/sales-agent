import { forwardRef } from 'react';
import { motion, type PanInfo } from 'framer-motion';
import { Building2, User } from 'lucide-react';
import { crmStageColor, formatCents, type CrmLead } from '../types';

/**
 * Derive up-to-two-letter initials from a lead's name (falls back to email).
 */
function leadInitials(lead: CrmLead): string {
  const base = (lead.name || lead.email || '?').trim();
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

export interface CrmLeadCardProps {
  lead: CrmLead;
  /** Open the detail drawer (fired on click, never on drag). */
  onOpen: (lead: CrmLead) => void;
  /** Enable framer-motion drag. The Kanban wires the drag lifecycle. */
  draggable?: boolean;
  onDragStart?: (lead: CrmLead) => void;
  /** Fired continuously while dragging — lets the parent highlight the hovered column. */
  onDrag?: (info: PanInfo) => void;
  /** Receives the pointer info so the parent can hit-test the drop column. */
  onDragEnd?: (lead: CrmLead, info: PanInfo) => void;
  /** Optional trailing quick-move control (rendered by the Kanban). */
  action?: React.ReactNode;
}

/**
 * A single lead card on the Kanban board — avatar initials, name, company,
 * a deal-value chip, tag pills, and the owner. When `draggable`, the card is
 * a framer-motion drag element; the Kanban hit-tests the drop on drag end.
 * Click (without a meaningful drag) opens the detail drawer.
 */
export const CrmLeadCard = forwardRef<HTMLDivElement, CrmLeadCardProps>(
  function CrmLeadCard(
    { lead, onOpen, draggable = false, onDragStart, onDrag, onDragEnd, action },
    ref,
  ) {
    const accent = crmStageColor(lead.stage);
    const tags = lead.tags ?? [];

    return (
      <motion.div
        ref={ref}
        layout
        layoutId={lead.id}
        data-lead-card={lead.id}
        drag={draggable}
        dragSnapToOrigin
        dragElastic={0.16}
        dragMomentum={false}
        // pointerEvents:none while dragging lets the parent's
        // document.elementFromPoint() hit-test see the column *beneath* the
        // card rather than the card itself — essential for drop detection.
        whileDrag={{ scale: 1.04, zIndex: 50, cursor: 'grabbing', pointerEvents: 'none' }}
        onDragStart={() => onDragStart?.(lead)}
        onDrag={(_e, info) => onDrag?.(info)}
        onDragEnd={(_e, info) => onDragEnd?.(lead, info)}
        whileHover={{ y: -2 }}
        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
        className="group relative cursor-pointer select-none rounded-xl border border-border-muted bg-surface p-3 text-left transition-colors hover:border-accent/50"
        style={{
          boxShadow: '0 1px 2px hsl(0 0% 0% / 0.25)',
        }}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(lead)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(lead);
          }
        }}
      >
        {/* Accent edge keyed to the stage. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-2.5 h-[calc(100%-1.25rem)] w-[3px] rounded-full"
          style={{ background: accent }}
        />

        <div className="flex items-start gap-2.5 pl-1.5">
          <span
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{
              background: `linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))`,
            }}
            aria-hidden
          >
            {leadInitials(lead)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-semibold text-text">{lead.name || lead.email}</p>
              {action ? <div className="-mr-1 -mt-1 flex-none">{action}</div> : null}
            </div>
            {lead.company ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-dim">
                <Building2 className="h-3 w-3 flex-none opacity-70" strokeWidth={2.2} />
                <span className="truncate">{lead.company}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-1.5">
          {lead.value_cents > 0 ? (
            <span
              className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
              style={{
                color: 'var(--wp-accent, #F26522)',
                background: 'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
              }}
            >
              {formatCents(lead.value_cents)}
            </span>
          ) : null}
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex max-w-[7rem] items-center truncate rounded-md border border-border-muted px-1.5 py-0.5 text-[10px] font-medium text-text-dim"
            >
              {tag}
            </span>
          ))}
          {tags.length > 3 ? (
            <span className="text-[10px] font-medium text-text-faint">
              +{tags.length - 3}
            </span>
          ) : null}
        </div>

        {lead.owner_email ? (
          <p className="mt-2 flex items-center gap-1 truncate pl-1.5 text-[10px] text-text-faint">
            <User className="h-2.5 w-2.5 flex-none" strokeWidth={2.2} />
            <span className="truncate">{lead.owner_email}</span>
          </p>
        ) : null}
      </motion.div>
    );
  },
);
