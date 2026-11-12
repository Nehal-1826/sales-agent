import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  useTransform,
  animate as fmAnimate,
} from 'framer-motion';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  Check,
  ChevronDown,
  Crown,
  Filter,
  Key,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Send,
  Trash2,
  User,
  Webhook,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * ProPlusWks4Inventory — Pro Plus "Workspace" rendered as a unified
 * **Resource Inventory Console**.
 *
 * The defining gesture: the workspace is a single power-admin inventory —
 * members, API keys, and webhooks live as rows under ONE table with a
 * leading Type column. A real filter toolbar (search · type chips · status ·
 * sort) genuinely narrows and reorders the rows via useState + useMemo, and
 * an *inline create row* at the top of the table prepends new rows with a
 * pop animation when "Add" is pressed.
 *
 * Distinctness — what this is NOT:
 *   - NOT ProWorkspace (card-rail + member pane). No rail, no pane.
 *   - NOT StarterWorkspace (identity hero + 3 stat cells + feed).
 *   - NOT AgencyWorkspace (multi-tab control panel).
 *   - NOT ProPlusWorkspace (hero + usage bars + member-ONLY table + bento
 *     footer with separate API-key + webhook cards). The whole point here
 *     is that members / keys / webhooks share ONE table.
 *   - NOT ProPlusWks1OrgChart (SVG hierarchy diagram with connectors).
 *   - NOT ProPlusWks2Access (permissions matrix cockpit).
 *   - NOT ProPlusWks3Hub (identity hub + activity stream + drawers).
 *
 * Standalone — prop-less, inline MOCK, no network / router / query hooks.
 * The harness supplies the shell + sidebar; this component renders page
 * content only. Animation: stat-strip count-up via animated motion values,
 * table rows stagger + layout on filter/sort re-flow, add-row pop on
 * prepend, action menu fades.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResourceType = 'member' | 'key' | 'webhook';
type ResourceStatus = 'active' | 'paused' | 'revoked';

interface InventoryRow {
  id: string;
  type: ResourceType;
  name: string;     // member name | key label | webhook hostname
  detail: string;   // member email | key prefix | full URL path
  owner: string;
  status: ResourceStatus;
  lastUsedMin: number; // minutes ago — 0 means never
}

type TypeFilter = 'all' | ResourceType;
type StatusFilter = 'all' | ResourceStatus;
type SortKey = 'type' | 'name' | 'owner' | 'status' | 'lastUsed';
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Mock data — ~17 rows mixing 8 members + 5 keys + 4 webhooks
// ---------------------------------------------------------------------------

const INITIAL_ROWS: InventoryRow[] = [
  // -- Members (8) --
  {
    id: 'm-1',
    type: 'member',
    name: 'Priya Anand',
    detail: 'priya@nimbusoutbound.io',
    owner: 'self',
    status: 'active',
    lastUsedMin: 3,
  },
  {
    id: 'm-2',
    type: 'member',
    name: 'Daniel Reyes',
    detail: 'daniel@nimbusoutbound.io',
    owner: 'self',
    status: 'active',
    lastUsedMin: 18,
  },
  {
    id: 'm-3',
    type: 'member',
    name: 'Saskia Werner',
    detail: 'saskia@nimbusoutbound.io',
    owner: 'self',
    status: 'active',
    lastUsedMin: 47,
  },
  {
    id: 'm-4',
    type: 'member',
    name: 'Marcus Lin',
    detail: 'marcus@nimbusoutbound.io',
    owner: 'self',
    status: 'active',
    lastUsedMin: 220,
  },
  {
    id: 'm-5',
    type: 'member',
    name: 'Joon-Ho Park',
    detail: 'joon@nimbusoutbound.io',
    owner: 'self',
    status: 'active',
    lastUsedMin: 1380,
  },
  {
    id: 'm-6',
    type: 'member',
    name: 'Elena Costa',
    detail: 'elena.costa@partner.co',
    owner: 'self',
    status: 'paused',
    lastUsedMin: 8640,
  },
  {
    id: 'm-7',
    type: 'member',
    name: 'Reggie Park',
    detail: 'reggie+intern@nimbusoutbound.io',
    owner: 'self',
    status: 'paused',
    lastUsedMin: 12_300,
  },
  {
    id: 'm-8',
    type: 'member',
    name: 'Alex Vu',
    detail: 'alex@former-contractor.dev',
    owner: 'self',
    status: 'revoked',
    lastUsedMin: 35_400,
  },
  // -- API keys (5) --
  {
    id: 'k-1',
    type: 'key',
    name: 'Production API',
    detail: 'wp_live_8Fk2···QmZ',
    owner: 'Priya Anand',
    status: 'active',
    lastUsedMin: 6,
  },
  {
    id: 'k-2',
    type: 'key',
    name: 'CI pipeline',
    detail: 'wp_live_a91Q···TyL',
    owner: 'Daniel Reyes',
    status: 'active',
    lastUsedMin: 180,
  },
  {
    id: 'k-3',
    type: 'key',
    name: 'Reporting export',
    detail: 'wp_live_Lz04···Bx2',
    owner: 'Saskia Werner',
    status: 'active',
    lastUsedMin: 2880,
  },
  {
    id: 'k-4',
    type: 'key',
    name: 'Mobile dashboard',
    detail: 'wp_live_M9pR···nKv',
    owner: 'Marcus Lin',
    status: 'paused',
    lastUsedMin: 14_400,
  },
  {
    id: 'k-5',
    type: 'key',
    name: 'Legacy import',
    detail: 'wp_live_C2fH···Wq8',
    owner: 'Joon-Ho Park',
    status: 'revoked',
    lastUsedMin: 64_800,
  },
  // -- Webhooks (4) --
  {
    id: 'w-1',
    type: 'webhook',
    name: 'hooks.nimbusoutbound.io',
    detail: 'https://hooks.nimbusoutbound.io/wp/events',
    owner: 'Daniel Reyes',
    status: 'active',
    lastUsedMin: 12,
  },
  {
    id: 'w-2',
    type: 'webhook',
    name: 'ops.nimbusoutbound.io',
    detail: 'https://ops.nimbusoutbound.io/ingest/warmpulse',
    owner: 'Saskia Werner',
    status: 'active',
    lastUsedMin: 95,
  },
  {
    id: 'w-3',
    type: 'webhook',
    name: 'analytics.partner.co',
    detail: 'https://analytics.partner.co/wp/relay',
    owner: 'Priya Anand',
    status: 'paused',
    lastUsedMin: 5760,
  },
  {
    id: 'w-4',
    type: 'webhook',
    name: 'legacy-zap.nimbusoutbound.io',
    detail: 'https://legacy-zap.nimbusoutbound.io/v1/wp',
    owner: 'Marcus Lin',
    status: 'revoked',
    lastUsedMin: 50_400,
  },
];

// Stat-strip "this-week activity" — derived feel; deterministic mock.
const WEEKLY_ACTIVITY = 312;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelMin(min: number): string {
  if (min <= 0) return 'never';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.round(mo / 12);
  return `${y}y ago`;
}

const TYPE_META: Record<ResourceType, {
  label: string;
  Icon: LucideIcon;
  tone: string; // text + bg pair
}> = {
  member: {
    label: 'Member',
    Icon: User,
    tone: 'text-text-dim bg-surface-2',
  },
  key: {
    label: 'API key',
    Icon: Key,
    tone: 'text-accent2 bg-accent2/10',
  },
  webhook: {
    label: 'Webhook',
    Icon: Webhook,
    tone: 'text-accent3 bg-accent3/10',
  },
};

const STATUS_META: Record<ResourceStatus, {
  label: string;
  dot: string;
  text: string;
}> = {
  active:  { label: 'Active',  dot: 'bg-accent',  text: 'text-accent'  },
  paused:  { label: 'Paused',  dot: 'bg-accent4', text: 'text-accent4' },
  revoked: { label: 'Revoked', dot: 'bg-accent3', text: 'text-accent3' },
};

const TYPE_CHIPS: { id: TypeFilter; label: string; Icon: LucideIcon }[] = [
  { id: 'all',     label: 'All',      Icon: Boxes  },
  { id: 'member',  label: 'Members',  Icon: User   },
  { id: 'key',     label: 'Keys',     Icon: Key    },
  { id: 'webhook', label: 'Webhooks', Icon: Webhook },
];

// Deterministic next-id generator so React keys never collide across adds.
let _nextId = 100;
function nextId(prefix: string): string {
  _nextId += 1;
  return `${prefix}-new-${_nextId}`;
}

// ---------------------------------------------------------------------------
// Animated count-up — used in the stat strip
// ---------------------------------------------------------------------------

function CountUp({ value, durationMs = 900 }: { value: number; durationMs?: number }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => formatNumber(Math.round(v)));
  useEffect(() => {
    const controls = fmAnimate(mv, value, {
      duration: durationMs / 1000,
      ease: 'easeOut',
    });
    return controls.stop;
  }, [value, durationMs, mv]);
  return <motion.span>{rounded}</motion.span>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusWks4Inventory(): JSX.Element {
  const [rows, setRows] = useState<InventoryRow[]>(INITIAL_ROWS);

  // -- Filter / sort state --
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [statusOpen, setStatusOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('lastUsed');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // -- Inline create row state --
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<ResourceType>('member');
  const [createName, setCreateName] = useState('');
  const [createOwner, setCreateOwner] = useState('Priya Anand');
  const [createDetail, setCreateDetail] = useState('');

  // -- Action menu state --
  const [menuRowId, setMenuRowId] = useState<string | null>(null);
  const menuLayerRef = useRef<HTMLDivElement | null>(null);

  // Click-outside for the action menu.
  useEffect(() => {
    if (!menuRowId) return;
    const onDown = (e: MouseEvent) => {
      if (!menuLayerRef.current) return;
      if (!menuLayerRef.current.contains(e.target as Node)) {
        setMenuRowId(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuRowId]);

  // -- Counts (live, derived) --
  const counts = useMemo(() => {
    let members = 0;
    let keys = 0;
    let webhooks = 0;
    for (const r of rows) {
      if (r.type === 'member') members += 1;
      else if (r.type === 'key') keys += 1;
      else webhooks += 1;
    }
    return { members, keys, webhooks };
  }, [rows]);

  // -- Filter + sort pipeline (real useMemo with all five dependencies) --
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.detail.toLowerCase().includes(q) ||
        r.owner.toLowerCase().includes(q)
      );
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: InventoryRow, b: InventoryRow): number => {
      switch (sortKey) {
        case 'type':    return a.type.localeCompare(b.type) * dir;
        case 'name':    return a.name.localeCompare(b.name) * dir;
        case 'owner':   return a.owner.localeCompare(b.owner) * dir;
        case 'status':  return a.status.localeCompare(b.status) * dir;
        case 'lastUsed':return (a.lastUsedMin - b.lastUsedMin) * dir;
      }
    };
    return [...filtered].sort(cmp);
  }, [rows, query, typeFilter, statusFilter, sortKey, sortDir]);

  // -- Column-click sort toggler --
  const onSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // -- Mutations: add / pause / resume / revoke / test --
  const resetCreate = () => {
    setCreateName('');
    setCreateDetail('');
    setCreateOwner('Priya Anand');
  };

  const submitCreate = () => {
    const name = createName.trim();
    const detail = createDetail.trim();
    if (!name) return;
    if (createType !== 'member' && !detail) return;

    const idPrefix = createType === 'member' ? 'm' : createType === 'key' ? 'k' : 'w';
    const computedDetail =
      createType === 'member'
        ? detail || `${name.toLowerCase().replace(/\s+/g, '.')}@nimbusoutbound.io`
        : detail;

    const next: InventoryRow = {
      id: nextId(idPrefix),
      type: createType,
      name,
      detail: computedDetail,
      owner: createType === 'member' ? 'self' : createOwner,
      status: 'active',
      lastUsedMin: 0,
    };
    setRows((prev) => [next, ...prev]);
    resetCreate();
    setCreateOpen(false);
  };

  const togglePause = (id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: r.status === 'paused' ? 'active' : 'paused' }
          : r,
      ),
    );
    setMenuRowId(null);
  };

  const revoke = (id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'revoked' } : r)),
    );
    setMenuRowId(null);
  };

  const sendTest = (id: string) => {
    // Just bump lastUsedMin to 0 — visible feedback through the "just now" cell.
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, lastUsedMin: 0 } : r)),
    );
    setMenuRowId(null);
  };

  const editPing = (id: string) => {
    // Light "edit" simulation — refresh lastUsedMin so the change is felt.
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, lastUsedMin: Math.max(1, Math.floor(r.lastUsedMin / 8)) } : r)),
    );
    setMenuRowId(null);
  };

  // -- Derived: status filter label --
  const statusLabel =
    statusFilter === 'all' ? 'Any status' : STATUS_META[statusFilter].label;

  return (
    <div className="flex h-full min-h-[640px] flex-col gap-5 text-text">
      {/* ============================================================
         Header
      ============================================================ */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-accent/15 text-accent"
            aria-hidden
          >
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-text">
                Resource inventory
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent4/40 bg-accent4/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent4">
                <Crown className="h-2.5 w-2.5" />
                Pro Plus
              </span>
            </div>
            <p className="text-xs text-text-dim">
              Everyone and everything with access to <span className="text-text">Nimbus Outbound</span> —
              members, API keys, and webhook endpoints in one place.
            </p>
          </div>
        </div>
      </motion.header>

      {/* ============================================================
         Stat strip — animated count-up
      ============================================================ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCell
          label="Members"
          value={counts.members}
          Icon={User}
          delay={0.0}
          tone="accent"
        />
        <StatCell
          label="API keys"
          value={counts.keys}
          Icon={Key}
          delay={0.06}
          tone="accent2"
        />
        <StatCell
          label="Webhooks"
          value={counts.webhooks}
          Icon={Webhook}
          delay={0.12}
          tone="accent3"
        />
        <StatCell
          label="Events · this week"
          value={WEEKLY_ACTIVITY}
          Icon={Activity}
          delay={0.18}
          tone="accent4"
        />
      </div>

      {/* ============================================================
         Filter toolbar
      ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.18 }}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border-muted bg-surface px-3 py-2.5"
      >
        {/* Search */}
        <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-text-dim" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, URL…"
            className="w-48 bg-transparent text-xs text-text outline-none placeholder:text-text-dim"
            aria-label="Search inventory"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded text-text-dim transition-colors hover:text-text"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        {/* Type chips */}
        <LayoutGroup id="ppwks4-type-chips">
          <div className="flex items-center gap-1 rounded-lg border border-border-muted bg-surface-2 p-1">
            {TYPE_CHIPS.map(({ id, label, Icon }) => {
              const active = typeFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTypeFilter(id)}
                  className={`relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    active ? 'text-text' : 'text-text-dim hover:text-text'
                  }`}
                  aria-pressed={active}
                >
                  {active ? (
                    <motion.span
                      layoutId="ppwks4-type-chip-bg"
                      className="absolute inset-0 rounded-md bg-accent/15 ring-1 ring-accent/30"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  ) : null}
                  <Icon className="relative z-10 h-3 w-3" />
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>

        {/* Status dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setStatusOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-2.5 py-1.5 text-xs text-text-dim transition-colors hover:text-text"
            aria-haspopup="listbox"
            aria-expanded={statusOpen}
          >
            <Filter className="h-3 w-3" />
            {statusLabel}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${statusOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <AnimatePresence>
            {statusOpen ? (
              <motion.ul
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-[calc(100%+4px)] z-20 w-40 overflow-hidden rounded-lg border border-border-muted bg-surface shadow-lg"
                role="listbox"
              >
                {(['all', 'active', 'paused', 'revoked'] as StatusFilter[]).map((s) => {
                  const isActive = statusFilter === s;
                  const label = s === 'all' ? 'Any status' : STATUS_META[s].label;
                  return (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter(s);
                          setStatusOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                          isActive
                            ? 'bg-surface-2 text-text'
                            : 'text-text-dim hover:bg-surface-2/60 hover:text-text'
                        }`}
                        role="option"
                        aria-selected={isActive}
                      >
                        {s !== 'all' ? (
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dot}`}
                            aria-hidden
                          />
                        ) : (
                          <span className="h-1.5 w-1.5" aria-hidden />
                        )}
                        <span className="flex-1">{label}</span>
                        {isActive ? <Check className="h-3 w-3 text-accent" /> : null}
                      </button>
                    </li>
                  );
                })}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Results count */}
        <span className="ml-auto text-[11px] uppercase tracking-wider text-text-dim">
          <span className="font-semibold text-text">{visibleRows.length}</span> of {rows.length} shown
        </span>

        {/* Add toggle */}
        <button
          type="button"
          onClick={() => {
            if (createOpen) {
              resetCreate();
            }
            setCreateOpen((o) => !o);
          }}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            createOpen
              ? 'border-accent bg-accent text-bg'
              : 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/15'
          }`}
        >
          {createOpen ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {createOpen ? 'Cancel' : 'New row'}
        </button>
      </motion.div>

      {/* ============================================================
         Inventory table (scrolls internally)
      ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.24 }}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-muted bg-surface"
      >
        {/* Column header */}
        <div className="grid grid-cols-[120px_minmax(0,1.6fr)_minmax(0,1fr)_120px_120px_44px] gap-3 border-b border-border-muted bg-surface-2/40 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
          <SortHeader label="Type"      k="type"     sortKey={sortKey} sortDir={sortDir} onClick={onSortClick} />
          <SortHeader label="Name"      k="name"     sortKey={sortKey} sortDir={sortDir} onClick={onSortClick} />
          <SortHeader label="Owner"     k="owner"    sortKey={sortKey} sortDir={sortDir} onClick={onSortClick} />
          <SortHeader label="Status"    k="status"   sortKey={sortKey} sortDir={sortDir} onClick={onSortClick} />
          <SortHeader label="Last used" k="lastUsed" sortKey={sortKey} sortDir={sortDir} onClick={onSortClick} />
          <span className="text-right">·</span>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto" ref={menuLayerRef}>
          {/* Inline create row */}
          <AnimatePresence initial={false}>
            {createOpen ? (
              <motion.div
                key="create-row"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden border-b border-border-muted bg-accent/[0.04]"
              >
                <div className="grid grid-cols-[120px_minmax(0,1.6fr)_minmax(0,1fr)_120px_120px_44px] gap-3 px-4 py-3">
                  {/* Type select */}
                  <select
                    value={createType}
                    onChange={(e) => {
                      setCreateType(e.target.value as ResourceType);
                      setCreateDetail('');
                    }}
                    className="rounded-md border border-border-muted bg-surface-2 px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
                    aria-label="Resource type"
                  >
                    <option value="member">Member</option>
                    <option value="key">API key</option>
                    <option value="webhook">Webhook</option>
                  </select>
                  {/* Contextual: name */}
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder={
                      createType === 'member'
                        ? 'Full name'
                        : createType === 'key'
                          ? 'Key label, e.g. CRM sync'
                          : 'Webhook label, e.g. CRM relay'
                    }
                    className="rounded-md border border-border-muted bg-surface-2 px-2.5 py-1.5 text-xs text-text outline-none placeholder:text-text-dim focus:border-accent"
                    aria-label="Name"
                  />
                  {/* Contextual: owner / detail */}
                  {createType === 'member' ? (
                    <input
                      type="email"
                      value={createDetail}
                      onChange={(e) => setCreateDetail(e.target.value)}
                      placeholder="user@nimbusoutbound.io"
                      className="rounded-md border border-border-muted bg-surface-2 px-2.5 py-1.5 text-xs text-text outline-none placeholder:text-text-dim focus:border-accent"
                      aria-label="Email"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={createDetail}
                        onChange={(e) => setCreateDetail(e.target.value)}
                        placeholder={createType === 'key' ? 'wp_live_…' : 'https://…'}
                        className="flex-1 rounded-md border border-border-muted bg-surface-2 px-2.5 py-1.5 text-xs text-text outline-none placeholder:text-text-dim focus:border-accent"
                        aria-label={createType === 'key' ? 'Key prefix' : 'Endpoint URL'}
                      />
                    </div>
                  )}
                  {/* Status — fixed Active for new rows */}
                  <span className="flex items-center gap-1.5 text-xs text-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                    Active
                  </span>
                  {/* Owner picker for non-members */}
                  {createType === 'member' ? (
                    <span className="text-xs text-text-dim">just now</span>
                  ) : (
                    <select
                      value={createOwner}
                      onChange={(e) => setCreateOwner(e.target.value)}
                      className="rounded-md border border-border-muted bg-surface-2 px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
                      aria-label="Creator"
                    >
                      {rows
                        .filter((r) => r.type === 'member' && r.status !== 'revoked')
                        .map((m) => (
                          <option key={m.id} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  )}
                  {/* Submit */}
                  <button
                    type="button"
                    onClick={submitCreate}
                    disabled={
                      !createName.trim() ||
                      (createType !== 'member' && !createDetail.trim())
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-dim"
                    aria-label="Add row"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Empty state */}
          {visibleRows.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
              <span className="text-sm text-text">No resources match the filters</span>
              <span className="text-xs text-text-dim">
                Try clearing the search or switching the type chip.
              </span>
            </div>
          ) : null}

          {/* Rows */}
          <AnimatePresence initial={false} mode="popLayout">
            {visibleRows.map((r, i) => {
              const isMenu = menuRowId === r.id;
              const meta = TYPE_META[r.type];
              const TIcon = meta.Icon;
              const stat = STATUS_META[r.status];
              return (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{
                    duration: 0.22,
                    delay: Math.min(i, 12) * 0.018,
                    layout: { duration: 0.28, ease: 'easeOut' },
                  }}
                  className="group grid grid-cols-[120px_minmax(0,1.6fr)_minmax(0,1fr)_120px_120px_44px] items-center gap-3 border-b border-border-muted/70 px-4 py-2.5 transition-colors hover:bg-surface-2/40"
                >
                  {/* Type pill */}
                  <span
                    className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}
                  >
                    <TIcon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  {/* Name + detail */}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text">{r.name}</div>
                    <div className="truncate font-mono text-[11px] text-text-dim">{r.detail}</div>
                  </div>
                  {/* Owner */}
                  <div className="truncate text-xs text-text-dim">
                    {r.owner === 'self' ? (
                      <span className="text-text">— (workspace member)</span>
                    ) : (
                      r.owner
                    )}
                  </div>
                  {/* Status */}
                  <span className={`flex items-center gap-1.5 text-xs ${stat.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${stat.dot}`} aria-hidden />
                    {stat.label}
                  </span>
                  {/* Last used */}
                  <span
                    className="text-xs tabular-nums text-text-dim"
                    title={`${r.lastUsedMin}m ago (raw)`}
                  >
                    {r.lastUsedMin === 0 ? (
                      <span className="text-accent">just now</span>
                    ) : (
                      formatRelMin(r.lastUsedMin)
                    )}
                  </span>
                  {/* Actions */}
                  <div className="relative flex justify-end">
                    <button
                      type="button"
                      onClick={() => setMenuRowId((id) => (id === r.id ? null : r.id))}
                      className={`flex h-6 w-6 items-center justify-center rounded-md text-text-dim transition-colors hover:bg-surface-2 hover:text-text ${
                        isMenu ? 'bg-surface-2 text-text' : ''
                      }`}
                      aria-haspopup="menu"
                      aria-expanded={isMenu}
                      aria-label={`Actions for ${r.name}`}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    <AnimatePresence>
                      {isMenu ? (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          transition={{ duration: 0.14 }}
                          className="absolute right-0 top-[calc(100%+4px)] z-30 w-44 overflow-hidden rounded-lg border border-border-muted bg-surface shadow-xl"
                          role="menu"
                        >
                          <ActionItem
                            Icon={Pencil}
                            label="Edit"
                            disabled={r.status === 'revoked'}
                            onClick={() => editPing(r.id)}
                          />
                          {r.type === 'webhook' ? (
                            <ActionItem
                              Icon={Send}
                              label="Send test"
                              disabled={r.status !== 'active'}
                              onClick={() => sendTest(r.id)}
                            />
                          ) : null}
                          {r.status !== 'revoked' ? (
                            <ActionItem
                              Icon={r.status === 'paused' ? Play : Pause}
                              label={r.status === 'paused' ? 'Resume' : 'Pause'}
                              onClick={() => togglePause(r.id)}
                            />
                          ) : null}
                          <ActionItem
                            Icon={Trash2}
                            label="Revoke"
                            tone="danger"
                            disabled={r.status === 'revoked'}
                            onClick={() => revoke(r.id)}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-border-muted bg-surface-2/30 px-4 py-2 text-[10px] uppercase tracking-wider text-text-dim">
          <span>
            Sorted by{' '}
            <span className="text-text">
              {sortKey === 'lastUsed' ? 'last used' : sortKey}
            </span>{' '}
            ({sortDir === 'asc' ? 'ascending' : 'descending'})
          </span>
          <span>
            Click any column to sort · Pro Plus inventory · workspace-scoped
          </span>
        </div>
      </motion.section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCell({
  label,
  value,
  Icon,
  delay,
  tone,
}: {
  label: string;
  value: number;
  Icon: LucideIcon;
  delay: number;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4';
}) {
  const ring =
    tone === 'accent'
      ? 'text-accent bg-accent/10'
      : tone === 'accent2'
        ? 'text-accent2 bg-accent2/10'
        : tone === 'accent3'
          ? 'text-accent3 bg-accent3/10'
          : 'text-accent4 bg-accent4/10';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="flex items-center gap-3 rounded-xl border border-border-muted bg-surface px-4 py-3"
    >
      <span
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${ring}`}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
          {label}
        </div>
        <div className="text-xl font-semibold tabular-nums text-text">
          <CountUp value={value} />
        </div>
      </div>
    </motion.div>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onClick(k)}
      className={`flex items-center gap-1 text-left transition-colors ${
        active ? 'text-accent' : 'text-text-dim hover:text-text'
      }`}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <Icon className="h-3 w-3 flex-none" />
    </button>
  );
}

function ActionItem({
  Icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  const toneCls =
    tone === 'danger'
      ? 'text-accent3 hover:bg-accent3/10'
      : 'text-text-dim hover:bg-surface-2/60 hover:text-text';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${toneCls} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}
      role="menuitem"
    >
      <Icon className="h-3 w-3 flex-none" />
      {label}
    </button>
  );
}

export default ProPlusWks4Inventory;
