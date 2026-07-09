import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, type PanInfo } from 'framer-motion';
import { Loader2, MoveRight, Search, Tag, X } from 'lucide-react';
import { toast } from '@/components/ui/AppToast';
import {
  AppDropdown,
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownLabel,
  AppDropdownTrigger,
} from '@/components/ui/AppDropdown';
import { cn } from '@/lib/cn';
import { useCampaignLeads, useUpdateLead, extractCrmError } from '../api';
import {
  CRM_STAGES,
  crmStageColor,
  formatCents,
  type CrmLead,
  type CrmStage,
} from '../types';
import { CrmLeadCard } from './CrmLeadCard';
import { LeadDetailDrawer } from './LeadDetailDrawer';

export interface CrmKanbanProps {
  campaignId: string;
}

/**
 * CrmKanban — the pipeline board.
 *
 * Six stage columns (new → lost). Each card is draggable (framer-motion) AND
 * carries a quick-move dropdown as an always-works fallback.
 *
 * Drop hit-testing is dependency-free: on drag end we read the pointer
 * coordinates from framer-motion's `PanInfo.point`, call
 * `document.elementFromPoint(x, y)`, then walk up to the nearest element
 * carrying a `data-stage-col` attribute. If that column differs from the
 * card's current stage we patch the lead. `dragSnapToOrigin` on the card
 * returns it home immediately; the optimistic cache update + framer `layout`
 * animation then float it into the new column.
 */
export function CrmKanban({ campaignId }: CrmKanbanProps) {
  const leadsQuery = useCampaignLeads(campaignId);
  const updateLead = useUpdateLead();

  const boardRef = useRef<HTMLDivElement>(null);
  const [openLead, setOpenLead] = useState<CrmLead | null>(null);
  const [dragStage, setDragStage] = useState<CrmStage | null>(null);

  // Filters (Tags & Segments + team workload): free-text search, an OR-set of
  // tags, and an owner filter. All applied client-side over the loaded leads.
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string>('all'); // 'all' | email | '__unassigned__'

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) for (const t of l.tags ?? []) if (t) s.add(t);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const allOwners = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) if (l.owner_email) s.add(l.owner_email);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (q && !`${l.name} ${l.email} ${l.company}`.toLowerCase().includes(q)) {
        return false;
      }
      if (tagFilter.length) {
        const tags = l.tags ?? [];
        if (!tagFilter.some((t) => tags.includes(t))) return false;
      }
      if (ownerFilter === '__unassigned__') {
        if (l.owner_email) return false;
      } else if (ownerFilter !== 'all' && l.owner_email !== ownerFilter) {
        return false;
      }
      return true;
    });
  }, [leads, search, tagFilter, ownerFilter]);

  const hasFilters =
    !!search.trim() || tagFilter.length > 0 || ownerFilter !== 'all';

  const toggleTag = (t: string) =>
    setTagFilter((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );

  const clearFilters = () => {
    setSearch('');
    setTagFilter([]);
    setOwnerFilter('all');
  };

  const byStage = useMemo(() => {
    const map = new Map<CrmStage, CrmLead[]>();
    for (const meta of CRM_STAGES) map.set(meta.key, []);
    for (const lead of filtered) {
      const bucket = map.get(lead.stage);
      if (bucket) bucket.push(lead);
      else map.get('new')?.push(lead); // unknown stage → fall into New
    }
    return map;
  }, [filtered]);

  const moveLead = (lead: CrmLead, stage: CrmStage) => {
    if (lead.stage === stage) return;
    updateLead.mutate(
      { id: lead.id, campaignId, payload: { stage } },
      {
        onError: (err) => toast.error(extractCrmError(err, 'Could not move lead')),
      },
    );
  };

  /**
   * Resolve which stage column sits under the pointer at drop time. Returns
   * null when the drop landed outside the board (card snaps back, no move).
   */
  const resolveDropStage = (info: PanInfo): CrmStage | null => {
    const { x, y } = info.point;
    const el = document.elementFromPoint(x, y);
    const col = el?.closest<HTMLElement>('[data-stage-col]');
    const stage = col?.dataset.stageCol as CrmStage | undefined;
    return stage && CRM_STAGES.some((s) => s.key === stage) ? stage : null;
  };

  const handleDragEnd = (lead: CrmLead, info: PanInfo) => {
    setDragStage(null);
    const target = resolveDropStage(info);
    if (target) moveLead(lead, target);
  };

  const handleDragOver = (info: PanInfo) => {
    const target = resolveDropStage(info);
    setDragStage(target);
  };

  if (leadsQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-text-dim">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading pipeline…
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* Filter bar — search + owner + tag chips (Tags & Segments). */}
        {leads.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint"
                aria-hidden
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads…"
                aria-label="Search leads"
                className="h-8 w-44 rounded-lg border border-border-muted bg-surface pl-8 pr-2 text-xs text-text placeholder:text-text-faint focus-ring focus:border-accent"
              />
            </div>

            {allOwners.length > 0 ? (
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                aria-label="Filter by owner"
                className="h-8 rounded-lg border border-border-muted bg-surface px-2 text-xs text-text focus-ring focus:border-accent"
              >
                <option value="all">All owners</option>
                <option value="__unassigned__">Unassigned</option>
                {allOwners.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : null}

            {allTags.map((t) => {
              const active = tagFilter.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors',
                    active ? 'text-text' : 'border-border-muted text-text-dim hover:text-text',
                  )}
                  style={
                    active
                      ? {
                          borderColor: 'var(--wp-accent, #F26522)',
                          background: 'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
                        }
                      : undefined
                  }
                >
                  <Tag className="h-3 w-3" strokeWidth={2.2} />
                  {t}
                </button>
              );
            })}

            {hasFilters ? (
              <>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-text-dim transition-colors hover:text-text"
                >
                  <X className="h-3 w-3" strokeWidth={2.4} />
                  Clear
                </button>
                <span className="ml-auto text-[11px] text-text-faint">
                  {filtered.length} of {leads.length}
                </span>
              </>
            ) : null}
          </div>
        ) : null}

        <div
          ref={boardRef}
          className="flex gap-3 overflow-x-auto pb-3"
          style={{ scrollbarWidth: 'none' }}
        >
          {CRM_STAGES.map((meta) => {
          const columnLeads = byStage.get(meta.key) ?? [];
          const sumValue = columnLeads.reduce((acc, l) => acc + (l.value_cents || 0), 0);
          const color = crmStageColor(meta.key);
          const isDropTarget = dragStage === meta.key;

          return (
            <section
              key={meta.key}
              data-stage-col={meta.key}
              className="flex w-[16.5rem] flex-none flex-col rounded-2xl border bg-surface-2/40 transition-colors"
              style={{
                borderColor: isDropTarget
                  ? 'color-mix(in srgb, var(--wp-accent, #F26522) 60%, transparent)'
                  : 'var(--border-muted, #2a2a3a)',
                background: isDropTarget
                  ? 'color-mix(in srgb, var(--wp-accent, #F26522) 7%, transparent)'
                  : undefined,
              }}
            >
              {/* Column header */}
              <header className="flex items-center gap-2 px-3 pb-2 pt-3">
                <span
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ background: color }}
                  aria-hidden
                />
                <span className="text-xs font-semibold tracking-tight text-text">
                  {meta.label}
                </span>
                <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
                  {columnLeads.length}
                </span>
                {sumValue > 0 ? (
                  <span
                    className="ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      color,
                      background: 'color-mix(in srgb, currentColor 12%, transparent)',
                    }}
                  >
                    {formatCents(sumValue)}
                  </span>
                ) : null}
              </header>

              {/* Cards */}
              <div className="flex min-h-[5rem] flex-1 flex-col gap-2 px-2.5 pb-3">
                <AnimatePresence initial={false}>
                  {columnLeads.map((lead) => (
                    <CrmLeadCard
                      key={lead.id}
                      lead={lead}
                      draggable
                      onOpen={setOpenLead}
                      onDragStart={() => setDragStage(lead.stage)}
                      onDragEnd={handleDragEnd}
                      onDrag={handleDragOver}
                      action={
                        <QuickMove
                          lead={lead}
                          onMove={(stage) => moveLead(lead, stage)}
                          pending={updateLead.isPending && updateLead.variables?.id === lead.id}
                        />
                      }
                    />
                  ))}
                </AnimatePresence>

                {columnLeads.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border-muted/70 py-6 text-center text-[11px] text-text-faint">
                    Drop leads here
                  </div>
                ) : null}
              </div>
            </section>
          );
          })}
        </div>
      </div>

      <LeadDetailDrawer
        lead={openLead}
        campaignId={campaignId}
        open={!!openLead}
        onOpenChange={(v) => {
          if (!v) setOpenLead(null);
        }}
      />
    </>
  );
}

/**
 * The always-works fallback for moving a lead between stages. A small
 * dropdown of every stage; selecting one patches the lead. Lives on every
 * card so keyboard / touch users (and anyone who finds drag finicky) still
 * have a reliable path.
 */
function QuickMove({
  lead,
  onMove,
  pending,
}: {
  lead: CrmLead;
  onMove: (stage: CrmStage) => void;
  pending: boolean;
}) {
  return (
    <AppDropdown>
      <AppDropdownTrigger asChild>
        <button
          type="button"
          aria-label="Move lead to another stage"
          onClick={(e) => e.stopPropagation()}
          // Block drag from starting when the user grabs the menu trigger.
          onPointerDownCapture={(e) => e.stopPropagation()}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-faint opacity-0 transition-all hover:bg-surface-2 hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MoveRight className="h-3.5 w-3.5" strokeWidth={2.2} />
          )}
        </button>
      </AppDropdownTrigger>
      <AppDropdownContent align="end" onClick={(e) => e.stopPropagation()}>
        <AppDropdownLabel>Move to</AppDropdownLabel>
        {CRM_STAGES.map((meta) => (
          <AppDropdownItem
            key={meta.key}
            disabled={meta.key === lead.stage}
            onSelect={() => onMove(meta.key)}
          >
            <span
              className="h-2 w-2 flex-none rounded-full"
              style={{ background: crmStageColor(meta.key) }}
              aria-hidden
            />
            {meta.label}
            {meta.key === lead.stage ? (
              <span className="ml-auto text-[10px] text-text-faint">current</span>
            ) : null}
          </AppDropdownItem>
        ))}
      </AppDropdownContent>
    </AppDropdown>
  );
}
