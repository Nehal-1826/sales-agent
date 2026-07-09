import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { toast } from '@/components/ui/AppToast';
import { cn } from '@/lib/cn';
import { useCampaignLeads, useEnrollLeads, extractCrmError } from '../api';
import { crmStageColor, type CrmLead } from '../types';

export interface EnrollLeadsDialogProps {
  sequenceId: string;
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Multi-select checklist of the campaign's leads, enrolling the chosen ones
 * into a sequence. Leads already enrolled (or otherwise ineligible) are
 * reported back by the server as `skipped`, which we surface in the toast.
 */
export function EnrollLeadsDialog({
  sequenceId,
  campaignId,
  open,
  onOpenChange,
}: EnrollLeadsDialogProps) {
  const leadsQuery = useCampaignLeads(open ? campaignId : null);
  const enroll = useEnrollLeads();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);

  // Reset transient state whenever the dialog reopens.
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setQuery('');
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q),
    );
  }, [leads, query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const l of filtered) next.delete(l.id);
      } else {
        for (const l of filtered) next.add(l.id);
      }
      return next;
    });
  };

  const close = (v: boolean) => {
    if (!v) enroll.reset();
    onOpenChange(v);
  };

  const onSubmit = () => {
    const lead_ids = Array.from(selected);
    if (lead_ids.length === 0) {
      toast.error('Select at least one lead');
      return;
    }
    enroll.mutate(
      { sequenceId, campaignId, payload: { lead_ids } },
      {
        onSuccess: (res) => {
          toast.success(`Enrolled ${res.enrolled} · skipped ${res.skipped}`);
          close(false);
        },
        onError: (err) => toast.error(extractCrmError(err, 'Could not enroll leads')),
      },
    );
  };

  return (
    <AppDialog open={open} onOpenChange={close}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Enroll leads</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          {/* Search + select-all */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search leads…"
                className="pl-8"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAllVisible}
              disabled={filtered.length === 0}
            >
              {allVisibleSelected ? 'Clear' : 'Select all'}
            </Button>
          </div>

          {/* Lead checklist */}
          <div
            className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border-muted bg-surface-2/30 p-1.5"
            style={{ scrollbarWidth: 'thin' }}
          >
            {leadsQuery.isLoading ? (
              <div className="flex items-center gap-2 px-2 py-6 text-sm text-text-dim">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading leads…
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm italic text-text-faint">
                {leads.length === 0 ? 'No leads in this campaign yet.' : 'No leads match your search.'}
              </p>
            ) : (
              filtered.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  checked={selected.has(lead.id)}
                  onToggle={() => toggle(lead.id)}
                />
              ))
            )}
          </div>
        </AppDialogBody>
        <AppDialogFooter>
          <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-text-dim">
            <Users className="h-3.5 w-3.5" strokeWidth={2.2} />
            {selected.size} selected
          </span>
          <Button variant="ghost" type="button" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={enroll.isPending || selected.size === 0}
            leftIcon={enroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {enroll.isPending ? 'Enrolling…' : `Enroll ${selected.size || ''}`.trim()}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function LeadRow({
  lead,
  checked,
  onToggle,
}: {
  lead: CrmLead;
  checked: boolean;
  onToggle: () => void;
}) {
  const stageColor = crmStageColor(lead.stage);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors',
        checked ? 'bg-accent/[0.08]' : 'hover:bg-surface-2/60',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors',
          checked ? 'border-accent bg-accent text-bg' : 'border-border-muted',
        )}
        aria-hidden
      >
        {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
      <span
        className="h-1.5 w-1.5 flex-none rounded-full"
        style={{ background: stageColor }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text">
          {lead.name || lead.email}
        </span>
        {lead.name ? (
          <span className="block truncate text-xs text-text-dim">{lead.email}</span>
        ) : null}
      </span>
    </button>
  );
}
