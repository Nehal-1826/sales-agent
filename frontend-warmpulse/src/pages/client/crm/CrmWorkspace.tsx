import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Archive,
  BarChart3,
  Infinity as InfinityIcon,
  LayoutGrid,
  Layers,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  AppDropdown,
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownLabel,
  AppDropdownSeparator,
  AppDropdownTrigger,
} from '@/components/ui/AppDropdown';
import { toast } from '@/components/ui/AppToast';
import { cn } from '@/lib/cn';
import {
  CrmAddLeadDialog,
  CrmAnalyticsPanel,
  CrmBentoLanding,
  CrmKanban,
  CsvImportDialog,
  SequenceList,
  extractCrmError,
  useCampaign,
  useCrmLimits,
  useDeleteCampaign,
  useUpdateCampaign,
} from '@/features/crm';

/**
 * Per-tier flavour passed in by the thin wrappers (Pro / Pro Plus / Agency).
 * The CRUD experience is identical across tiers — only header treatment,
 * accent intensity and copy differ, so the three feel tailored without
 * forking the logic.
 */
export interface CrmTierFlavor {
  /** Badge label shown next to the title: "Pro" / "Pro Plus" / "Agency". */
  tierLabel: string;
  /** Short eyebrow line under the page title. */
  tagline: string;
  /** Emphasis level — drives header gradient + cap-chip styling intensity. */
  emphasis: 'focused' | 'rich' | 'command';
}

export interface CrmWorkspaceProps {
  flavor: CrmTierFlavor;
}

/**
 * The full CRM experience shared by every paid tier.
 *
 * Two views, cross-faded with framer-motion:
 *   1. Campaign list — `CampaignList` (cap-aware) + a `CrmSummaryStats` row.
 *   2. Campaign board — `CrmKanban` for the selected campaign, with a
 *      sub-header carrying back / add-lead / import / settings actions.
 *
 * All server state flows through the `@/features/crm` hooks; this component
 * owns only ephemeral UI state (selected campaign + dialog open flags).
 */
export function CrmWorkspace({ flavor }: CrmWorkspaceProps) {
  const limitsQuery = useCrmLimits();
  const [selected, setSelected] = useState<string | null>(null);

  const cap = limitsQuery.data?.cap ?? null;
  const used = limitsQuery.data?.used ?? 0;

  return (
    <div className="space-y-5">
      <CrmHeader flavor={flavor} cap={cap} used={used} loading={limitsQuery.isLoading} />

      <AnimatePresence mode="wait" initial={false}>
        {selected ? (
          <motion.div
            key="board"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <CampaignBoard campaignId={selected} onBack={() => setSelected(null)} />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <CrmBentoLanding cap={cap} used={used} onOpen={setSelected} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header — title + tier badge + cap chip, accent framing per tier.
// ---------------------------------------------------------------------------

const EMPHASIS_RING: Record<CrmTierFlavor['emphasis'], string> = {
  focused: 'from-accent/[0.06] to-transparent',
  rich: 'from-accent/[0.10] via-accent2/[0.05] to-transparent',
  command: 'from-accent/[0.14] via-accent2/[0.07] to-transparent',
};

function CrmHeader({
  flavor,
  cap,
  used,
  loading,
}: {
  flavor: CrmTierFlavor;
  cap: number | null;
  used: number;
  loading: boolean;
}) {
  const unlimited = cap === null;
  const remaining = unlimited ? null : Math.max(cap - used, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border-muted bg-surface p-5',
      )}
    >
      {/* Tier accent wash */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br',
          EMPHASIS_RING[flavor.emphasis],
        )}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">CRM</h1>
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                color: 'var(--wp-accent, #F26522)',
                borderColor: 'color-mix(in srgb, var(--wp-accent, #F26522) 35%, transparent)',
                background: 'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)',
              }}
            >
              {flavor.emphasis === 'command' ? (
                <Sparkles className="h-3 w-3" strokeWidth={2.4} />
              ) : null}
              {flavor.tierLabel}
            </span>
          </div>
          <p className="text-sm text-text-dim">{flavor.tagline}</p>
        </div>

        {/* Cap chip */}
        <div
          className={cn(
            'flex flex-none items-center gap-2 rounded-xl border px-3 py-2',
            unlimited
              ? 'border-accent/40 bg-accent/[0.07]'
              : 'border-border-muted bg-surface-2/60',
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-text-dim" />
          ) : unlimited ? (
            <>
              <InfinityIcon className="h-4 w-4 text-accent" strokeWidth={2.4} />
              <div className="leading-tight">
                <p className="text-sm font-semibold text-text">Unlimited campaigns</p>
                <p className="text-[11px] text-text-dim">{used} active</p>
              </div>
            </>
          ) : (
            <div className="leading-tight">
              <p className="text-sm font-semibold text-text">
                {used} of {cap} campaigns
              </p>
              <p className="text-[11px] text-text-dim">
                {remaining === 0
                  ? 'Cap reached — upgrade for more'
                  : `${remaining} slot${remaining === 1 ? '' : 's'} remaining`}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Campaign-board view — Kanban + sub-header with lead/import/settings actions.
// ---------------------------------------------------------------------------

function CampaignBoard({
  campaignId,
  onBack,
}: {
  campaignId: string;
  onBack: () => void;
}) {
  const campaignQuery = useCampaign(campaignId);
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();

  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [view, setView] = useState<CampaignView>('board');

  const campaign = campaignQuery.data;
  const status = campaign?.status ?? 'active';

  const setStatus = (next: 'active' | 'paused' | 'archived') => {
    updateCampaign.mutate(
      { id: campaignId, payload: { status: next } },
      {
        onSuccess: () =>
          toast.success(
            next === 'active'
              ? 'Campaign resumed'
              : next === 'paused'
                ? 'Campaign paused'
                : 'Campaign archived',
          ),
        onError: (err) => toast.error(extractCrmError(err, 'Could not update campaign')),
      },
    );
  };

  const remove = () => {
    deleteCampaign.mutate(campaignId, {
      onSuccess: () => {
        toast.success('Campaign deleted');
        onBack();
      },
      onError: (err) => toast.error(extractCrmError(err, 'Could not delete campaign')),
    });
  };

  return (
    <div className="space-y-4">
      {/* Sub-header */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface px-2.5 py-1.5 text-xs font-medium text-text-dim transition-colors hover:border-accent/40 hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.4} />
          Campaigns
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight text-text">
              {campaign?.name ?? 'Campaign'}
            </h2>
            {status !== 'active' ? (
              <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-dim">
                {status}
              </span>
            ) : null}
          </div>
          {campaign?.description ? (
            <p className="truncate text-xs text-text-dim">{campaign.description}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {view === 'board' ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)} leftIcon={<Upload className="h-4 w-4" />}>
                Import CSV
              </Button>
              <Button size="sm" onClick={() => setAddLeadOpen(true)} leftIcon={<UserPlus className="h-4 w-4" />}>
                Add lead
              </Button>
            </>
          ) : null}
          <CampaignSettingsMenu
            status={status}
            onSetStatus={setStatus}
            onDelete={remove}
            busy={updateCampaign.isPending || deleteCampaign.isPending}
          />
        </div>
      </div>

      {/* Board | Sequences toggle */}
      <ViewToggle view={view} onChange={setView} />

      {/* Content */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${view}-view`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {view === 'board' ? (
            <CrmKanban campaignId={campaignId} />
          ) : view === 'sequences' ? (
            <SequenceList campaignId={campaignId} />
          ) : (
            <CrmAnalyticsPanel campaignId={campaignId} />
          )}
        </motion.div>
      </AnimatePresence>

      <CrmAddLeadDialog campaignId={campaignId} open={addLeadOpen} onOpenChange={setAddLeadOpen} />
      <CsvImportDialog campaignId={campaignId} open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board | Sequences segmented toggle — framer-motion layoutId underline.
// ---------------------------------------------------------------------------

type CampaignView = 'board' | 'sequences' | 'analytics';

const VIEW_TABS: { key: CampaignView; label: string; Icon: typeof LayoutGrid }[] = [
  { key: 'board', label: 'Board', Icon: LayoutGrid },
  { key: 'sequences', label: 'Sequences', Icon: Layers },
  { key: 'analytics', label: 'Analytics', Icon: BarChart3 },
];

function ViewToggle({
  view,
  onChange,
}: {
  view: CampaignView;
  onChange: (next: CampaignView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Campaign view"
      className="inline-flex items-center gap-1 rounded-xl border border-border-muted bg-surface p-1"
    >
      {VIEW_TABS.map(({ key, label, Icon }) => {
        const active = view === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'text-text' : 'text-text-dim hover:text-text',
            )}
          >
            {active ? (
              <motion.span
                layoutId="crm-view-toggle-active"
                className="absolute inset-0 rounded-lg bg-accent/[0.12]"
                style={{ border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 40%, transparent)' }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            ) : null}
            <Icon className="relative h-4 w-4" strokeWidth={2.2} />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CampaignSettingsMenu({
  status,
  onSetStatus,
  onDelete,
  busy,
}: {
  status: 'active' | 'paused' | 'archived';
  onSetStatus: (next: 'active' | 'paused' | 'archived') => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <AppDropdown>
      <AppDropdownTrigger asChild>
        <button
          type="button"
          aria-label="Campaign settings"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-muted bg-surface text-text-dim transition-colors hover:border-accent/40 hover:text-text"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
        </button>
      </AppDropdownTrigger>
      <AppDropdownContent align="end">
        <AppDropdownLabel>Campaign</AppDropdownLabel>
        {status === 'active' ? (
          <AppDropdownItem onSelect={() => onSetStatus('paused')}>
            <Pause className="h-3.5 w-3.5" strokeWidth={2.2} />
            Pause campaign
          </AppDropdownItem>
        ) : (
          <AppDropdownItem onSelect={() => onSetStatus('active')}>
            <Play className="h-3.5 w-3.5" strokeWidth={2.2} />
            Resume campaign
          </AppDropdownItem>
        )}
        {status !== 'archived' ? (
          <AppDropdownItem onSelect={() => onSetStatus('archived')}>
            <Archive className="h-3.5 w-3.5" strokeWidth={2.2} />
            Archive
          </AppDropdownItem>
        ) : null}
        <AppDropdownSeparator />
        <AppDropdownItem danger onSelect={onDelete}>
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
          Delete campaign
        </AppDropdownItem>
      </AppDropdownContent>
    </AppDropdown>
  );
}

export default CrmWorkspace;
