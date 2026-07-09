import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  Check,
  Crown,
  Mail,
  Pencil,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import { extractErrorMessage } from '@/lib/errors';
import {
  useInviteMember,
  useRemoveMember,
} from '@/features/workspace/api';

/**
 * ProPlusWks1OrgChart — Pro Plus "Workspace" design as an *organisational
 * chart / people roster*. The workspace is rendered as a top-down hierarchy
 * diagram with hand-built SVG connector lines, a strict parent-child layout
 * and orthogonal connectors so the reporting line is unambiguous:
 *
 *   Workspace → Owner → Admin → (each admin owns its OWN column of members)
 *
 * Distinctness — what this is NOT:
 *   - ProWorkspace (card-rail + member pane): no rail, no list-then-pane.
 *   - StarterWorkspace / AgencyWorkspace (tab control): no tabs.
 *   - ProPlusWorkspace (hero + usage bars + table + bento): no usage bars,
 *     no member table, no bento footer.
 *   - Sibling Wks slots: NOT an access/permissions matrix, identity-hub +
 *     activity stream, or unified-inventory table.
 *
 * It is unmistakably an org-chart / diagram paradigm: nodes laid out by
 * coordinates, orthogonal connector lines drawn between parent and direct
 * child only, a side inspector drawer for the selected node. Real selection
 * state, real prepend-on-add via inline mini-forms in a floating toolbar.
 *
 * Standalone: prop-less, inline MOCK, no network / router / query hooks.
 * Renders page content only — the preview harness provides shell/nav.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PersonRole = 'owner' | 'admin' | 'member';

export interface Person {
  id: string;
  name: string;
  email: string;
  role: PersonRole;
  lastActiveAgo: string;
  mailboxesAssigned: number;
  /**
   * For role==='member' only — id of the admin (or owner, as fallback) the
   * member reports to. Drives the column placement and the connector parent.
   * For owner/admin this field is unused and left undefined.
   */
  managedBy?: string;
}

/** Convenience alias — an owner/admin Person (no `managedBy`). */
export type Admin = Person;
/** Convenience alias — a member Person (has `managedBy`). */
export type Member = Person;

export interface WorkspaceInfo {
  name: string;
  slug: string;
  plan: string;
  region: string;
}

/**
 * Full data shape consumed by the org-chart component. The live adapter
 * (`features/workspace/useProPlusWorkspaceData.ts`) maps real workspace /
 * team hooks onto this shape; the design-preview harness keeps the component
 * prop-less and the inline `ORG_CHART_SKELETON` is used verbatim.
 */
export interface OrgChartData {
  workspace: WorkspaceInfo;
  people: Person[];
}

type SelectedNode =
  | { kind: 'workspace' }
  | { kind: 'person'; id: string };

// ---------------------------------------------------------------------------
// Mock data — Pro Plus workspace
// ---------------------------------------------------------------------------

const WORKSPACE: WorkspaceInfo = {
  name: 'Nimbus Outbound',
  slug: 'nimbus-outbound',
  plan: 'Pro Plus',
  region: 'us-east',
};

// Two admins, 3 members each (6 members total) for a clean 3-deep tree with
// balanced columns under each admin.
const INITIAL_PEOPLE: Person[] = [
  {
    id: 'p-owner',
    name: 'Iris Vance',
    email: 'iris@nimbusoutbound.io',
    role: 'owner',
    lastActiveAgo: '2m ago',
    mailboxesAssigned: 6,
  },
  {
    id: 'p-admin-1',
    name: 'Mateo Reyes',
    email: 'mateo@nimbusoutbound.io',
    role: 'admin',
    lastActiveAgo: '14m ago',
    mailboxesAssigned: 4,
  },
  {
    id: 'p-admin-2',
    name: 'Priya Sundaram',
    email: 'priya@nimbusoutbound.io',
    role: 'admin',
    lastActiveAgo: '1h ago',
    mailboxesAssigned: 3,
  },
  // Column A — under Mateo
  {
    id: 'p-m-1',
    name: 'Jonas Krieg',
    email: 'jonas@nimbusoutbound.io',
    role: 'member',
    lastActiveAgo: '32m ago',
    mailboxesAssigned: 2,
    managedBy: 'p-admin-1',
  },
  {
    id: 'p-m-2',
    name: 'Hannah Yu',
    email: 'hannah@nimbusoutbound.io',
    role: 'member',
    lastActiveAgo: '3h ago',
    mailboxesAssigned: 2,
    managedBy: 'p-admin-1',
  },
  {
    id: 'p-m-3',
    name: 'Devin Aoki',
    email: 'devin@nimbusoutbound.io',
    role: 'member',
    lastActiveAgo: '4h ago',
    mailboxesAssigned: 1,
    managedBy: 'p-admin-1',
  },
  // Column B — under Priya
  {
    id: 'p-m-4',
    name: 'Sloane Park',
    email: 'sloane@nimbusoutbound.io',
    role: 'member',
    lastActiveAgo: '1d ago',
    mailboxesAssigned: 1,
    managedBy: 'p-admin-2',
  },
  {
    id: 'p-m-5',
    name: 'Rafael Mota',
    email: 'rafael@nimbusoutbound.io',
    role: 'member',
    lastActiveAgo: '2d ago',
    mailboxesAssigned: 1,
    managedBy: 'p-admin-2',
  },
  {
    id: 'p-m-6',
    name: 'Tess Holloway',
    email: 'tess@nimbusoutbound.io',
    role: 'member',
    lastActiveAgo: '5d ago',
    mailboxesAssigned: 0,
    managedBy: 'p-admin-2',
  },
];

/**
 * Full skeleton — the same inline mock the preview harness has always rendered,
 * surfaced as a typed constant so the live adapter can overlay real values onto
 * a known-good baseline. Used as the default `data` when the component is
 * rendered prop-less (preview harness).
 */
export const ORG_CHART_SKELETON: OrgChartData = {
  workspace: WORKSPACE,
  people: INITIAL_PEOPLE,
};

// ---------------------------------------------------------------------------
// Layout — every node has a fixed (x, y) inside the SVG canvas so the chart is
// stable in the preview harness regardless of container width.
//
//   - People (workspace → owner → admins → members)
// ---------------------------------------------------------------------------

const CANVAS_W = 1240;
const CANVAS_H = 1180;

const WS_NODE = { x: CANVAS_W / 2, y: 72, w: 280, h: 92 };

// People branch — left half. Owner is the SINGLE child of workspace on this
// branch, dead-centre over the two admins below.
const PEOPLE_CENTER_X = 370;
const OWNER_NODE = { x: PEOPLE_CENTER_X, y: 232, w: 240, h: 108 };
const ADMIN_NODES = [
  { x: 210, y: 420, w: 220, h: 104 },
  { x: 530, y: 420, w: 220, h: 104 },
];

// Members hang in a vertical column directly below their admin.
const MEMBER_NODE_W = 220;
const MEMBER_NODE_H = 92;
const MEMBER_TOP_Y = 600;
const MEMBER_ROW_GAP = 112;

function memberPos(adminIndex: number, rowIndex: number) {
  const admin = ADMIN_NODES[adminIndex] ?? ADMIN_NODES[0]!;
  return {
    x: admin.x,
    y: MEMBER_TOP_Y + rowIndex * MEMBER_ROW_GAP,
    w: MEMBER_NODE_W,
    h: MEMBER_NODE_H,
  };
}

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

const ROLE_ICON: Record<PersonRole, LucideIcon> = {
  owner: Crown,
  admin: ShieldCheck,
  member: User,
};

const ROLE_ACCENT: Record<PersonRole, { ring: string; text: string; dot: string }> = {
  owner: {
    ring: 'border-accent/60 shadow-[0_0_28px_-12px_rgba(242, 101, 34,0.65)]',
    text: 'text-accent',
    dot: 'bg-accent',
  },
  admin: {
    ring: 'border-accent4/50',
    text: 'text-accent4',
    dot: 'bg-accent4',
  },
  member: {
    ring: 'border-border-muted',
    text: 'text-text-dim',
    dot: 'bg-text-dim',
  },
};

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Orthogonal (right-angle) connector path between two node centres.
 *
 * Drops vertically from `(fromX, fromY)` to a shared rail at `midY`, runs
 * horizontally to `toX`, then drops vertically to `(toX, toY)`. The midY
 * defaults to the halfway point so siblings share a clean visual rail —
 * eliminating curve-crossing that bezier connectors produced.
 */
function orthogonalPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  midY?: number,
): string {
  const rail = midY ?? fromY + (toY - fromY) * 0.5;
  // Same-column case — just drop straight down, no horizontal leg needed.
  if (Math.abs(fromX - toX) < 0.5) {
    return `M ${fromX} ${fromY} V ${toY}`;
  }
  return `M ${fromX} ${fromY} V ${rail} H ${toX} V ${toY}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusWks1OrgChart(
  { data }: { data?: OrgChartData } = {},
): JSX.Element {
  // Default to the skeleton when no `data` prop is supplied — the design
  // preview at :35001 still renders <ProPlusWks1OrgChart /> prop-less, so the
  // skeleton (the file's original inline mock) must keep working as-is.
  const d = data ?? ORG_CHART_SKELETON;

  const [people, setPeople] = useState<Person[]>(d.people);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [adder, setAdder] = useState<null | 'person'>(null);

  // Real backend mutations — every add / remove below now persists.
  const inviteMember = useInviteMember();
  const removeMember = useRemoveMember();

  const owner = useMemo(() => people.find((p) => p.role === 'owner') ?? null, [people]);
  const admins = useMemo(() => people.filter((p) => p.role === 'admin'), [people]);
  const members = useMemo(() => people.filter((p) => p.role === 'member'), [people]);

  // Group members by the admin they report to so each admin gets its own
  // vertical column of children. Members whose managedBy points at a removed
  // admin (or is missing) fall through to the first admin as a safe default.
  const membersByAdmin = useMemo(() => {
    const byId = new Map<string, Person[]>();
    for (const a of admins) byId.set(a.id, []);
    const fallbackId = admins[0]?.id ?? owner?.id ?? '';
    for (const m of members) {
      const parentId =
        m.managedBy && byId.has(m.managedBy) ? m.managedBy : fallbackId;
      const list = byId.get(parentId);
      if (list) list.push(m);
    }
    return byId;
  }, [admins, members, owner]);

  // ---- Add handlers — real state, prepended ---------------------------------

  const addPerson = (
    name: string,
    email: string,
    role: 'admin' | 'member',
    managedBy?: string,
  ) => {
    // Persist the invite. Only email + role have a backend home; `name` and
    // `managedBy` are UI-only constructs (no per-member manager column yet) so
    // we drop them from the payload but still use them for the optimistic node.
    const cleanEmail = email.trim();
    inviteMember.mutate(
      { email: cleanEmail, role },
      {
        onSuccess: () => toast.success(`Invited ${cleanEmail}`),
        onError: (err) =>
          toast.error(extractErrorMessage(err, 'Failed to send invite')),
      },
    );
    const id = `p-new-${Date.now()}`;
    const trimmed = name.trim() || email.split('@')[0]!;
    setPeople((prev) => {
      // Place owner first, then admins, then members — keeps role-grouped order.
      // For members we also stamp managedBy so the new node lands under the
      // correct admin column immediately.
      const next: Person = {
        id,
        name: trimmed,
        email: email.trim(),
        role,
        lastActiveAgo: 'just now',
        mailboxesAssigned: 0,
        managedBy:
          role === 'member'
            ? managedBy ?? prev.find((p) => p.role === 'admin')?.id
            : undefined,
      };
      if (role === 'admin') {
        const ownerIdx = prev.findIndex((p) => p.role === 'owner');
        const copy = [...prev];
        copy.splice(ownerIdx + 1, 0, next);
        return copy;
      }
      const lastAdminIdx = prev.map((p) => p.role).lastIndexOf('admin');
      const insertAt = lastAdminIdx === -1 ? 1 : lastAdminIdx + 1;
      const copy = [...prev];
      copy.splice(insertAt, 0, next);
      return copy;
    });
    setSelected({ kind: 'person', id });
    setAdder(null);
  };

  const removeSelected = async () => {
    if (!selected) return;
    if (selected.kind === 'person') {
      // Look up the row before we mutate state so we can do reassignment.
      const target = people.find((p) => p.id === selected.id);
      if (!target || target.role === 'owner') return;
      const ok = await confirm({
        title: 'Remove team member?',
        description: `${target.email} will lose access to the workspace immediately.`,
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!ok) return;
      const snapshot = people;
      if (target.role === 'admin') {
        // Reassign this admin's members to the OTHER admin if one exists,
        // otherwise fall back to the owner so no member ends up orphaned.
        const otherAdmin = people.find(
          (p) => p.role === 'admin' && p.id !== target.id,
        );
        const reassignTo = otherAdmin?.id ?? owner?.id;
        setPeople((prev) =>
          prev
            .filter((p) => p.id !== target.id)
            .map((p) =>
              p.role === 'member' && p.managedBy === target.id
                ? { ...p, managedBy: reassignTo }
                : p,
            ),
        );
      } else {
        setPeople((prev) => prev.filter((p) => p.id !== target.id));
      }
      setSelected(null);
      removeMember.mutate(target.id, {
        onSuccess: () => toast.success('Member removed'),
        onError: (err) => {
          setPeople(snapshot); // roll back optimistic removal
          toast.error(extractErrorMessage(err, 'Failed to remove'));
        },
      });
    }
  };

  // ---- Render ---------------------------------------------------------------

  const ownerPos = OWNER_NODE;
  const wsCenterX = WS_NODE.x;
  const wsBottomY = WS_NODE.y + WS_NODE.h / 2;

  return (
    <div className="space-y-5">
      {/* Header strip */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Workspace · Org chart
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            People
          </h1>
          <p className="text-sm text-text-dim">
            Everyone who can act on{' '}
            <span className="text-text">{d.workspace.name}</span> — laid out by reporting
            line. Click any node to inspect.
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={adder === 'person' ? 'primary' : 'secondary'}
            onClick={() => setAdder(adder === 'person' ? null : 'person')}
            leftIcon={<UserPlus className="h-3.5 w-3.5" />}
          >
            Invite member
          </Button>
        </div>
      </header>

      {/* Inline mini-form (replaces the toolbar's add button area) */}
      <AnimatePresence>
        {adder ? (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
              <AddPersonForm
                admins={admins}
                onCancel={() => setAdder(null)}
                onAdd={addPerson}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Chart + inspector */}
      <div className="relative grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        {/* Chart canvas */}
        <div className="relative overflow-x-auto rounded-2xl border border-border-muted bg-surface/40 p-4 backdrop-blur-xl">
          {/* Faint grid backdrop */}
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(0deg,#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',
              backgroundSize: '40px 40px',
            }}
            aria-hidden
          />

          <div
            className="relative mx-auto"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            {/* SVG connector overlay — drawn below the node boxes. Connectors
                are STRICTLY parent → direct child. No diagonal cross-tier
                lines, no "round-robin" guesses: every member has exactly one
                connector, going up to its own admin only. */}
            <svg
              className="pointer-events-none absolute inset-0"
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              width={CANVAS_W}
              height={CANVAS_H}
              aria-hidden
            >
              {/* Workspace → Owner (people branch root) */}
              {owner ? (
                <DrawConnector
                  d={orthogonalPath(
                    wsCenterX,
                    wsBottomY,
                    ownerPos.x,
                    ownerPos.y - ownerPos.h / 2,
                  )}
                  delay={0.15}
                  tone="accent"
                />
              ) : null}

              {/* Owner → each Admin. They share the same horizontal rail so
                  the two admins read as siblings under owner. */}
              {owner
                ? admins.map((a, i) => {
                    const pos = ADMIN_NODES[i] ?? ADMIN_NODES[ADMIN_NODES.length - 1]!;
                    return (
                      <DrawConnector
                        key={`oa-${a.id}`}
                        d={orthogonalPath(
                          ownerPos.x,
                          ownerPos.y + ownerPos.h / 2,
                          pos.x,
                          pos.y - pos.h / 2,
                        )}
                        delay={0.3 + i * 0.05}
                        tone="accent4"
                      />
                    );
                  })
                : null}

              {/* Admin → its OWN members. Members sit in a vertical column
                  directly below the admin, so the connector is a single
                  straight vertical line per member — no admin's connector
                  ever crosses into the other admin's column. */}
              {admins.map((a, aIdx) => {
                const pos = ADMIN_NODES[aIdx] ?? ADMIN_NODES[ADMIN_NODES.length - 1]!;
                const list = membersByAdmin.get(a.id) ?? [];
                return list.map((m, mIdx) => {
                  const mp = memberPos(aIdx, mIdx);
                  return (
                    <DrawConnector
                      key={`am-${a.id}-${m.id}`}
                      d={orthogonalPath(
                        pos.x,
                        pos.y + pos.h / 2,
                        mp.x,
                        mp.y - mp.h / 2,
                      )}
                      delay={0.45 + (aIdx * 4 + mIdx) * 0.04}
                      tone="muted"
                    />
                  );
                });
              })}
            </svg>

            {/* Workspace node */}
            <motion.button
              type="button"
              onClick={() => setSelected({ kind: 'workspace' })}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}
              whileHover={{ y: -2 }}
              className={`absolute flex flex-col items-center justify-center rounded-2xl border-2 px-5 text-center transition-shadow ${
                selected?.kind === 'workspace'
                  ? 'border-accent shadow-[0_0_32px_-8px_rgba(242, 101, 34,0.7)]'
                  : 'border-accent/60 shadow-[0_0_22px_-12px_rgba(242, 101, 34,0.55)]'
              } bg-surface/80 backdrop-blur-xl`}
              style={nodeStyle(WS_NODE)}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Building2 className="h-4 w-4" />
                </span>
                <span className="text-base font-semibold text-text">
                  {d.workspace.name}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-dim">
                <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">
                  {d.workspace.plan}
                </span>
                <span>{d.workspace.region}</span>
                <span>·</span>
                <span>{people.length} people</span>
              </div>
            </motion.button>

            {/* Owner node */}
            {owner ? (
              <PersonNode
                pos={ownerPos}
                person={owner}
                selected={
                  selected?.kind === 'person' && selected.id === owner.id
                }
                onClick={() => setSelected({ kind: 'person', id: owner.id })}
                animateDelay={0.2}
              />
            ) : null}

            {/* Admin nodes */}
            {admins.map((a, i) => {
              const pos = ADMIN_NODES[i] ?? ADMIN_NODES[ADMIN_NODES.length - 1]!;
              return (
                <PersonNode
                  key={a.id}
                  pos={pos}
                  person={a}
                  selected={
                    selected?.kind === 'person' && selected.id === a.id
                  }
                  onClick={() => setSelected({ kind: 'person', id: a.id })}
                  animateDelay={0.35 + i * 0.06}
                />
              );
            })}

            {/* Member nodes — grouped by admin, stacked in vertical columns */}
            <AnimatePresence>
              {admins.flatMap((a, aIdx) => {
                const list = membersByAdmin.get(a.id) ?? [];
                return list.map((m, mIdx) => {
                  const pos = memberPos(aIdx, mIdx);
                  return (
                    <PersonNode
                      key={m.id}
                      pos={pos}
                      person={m}
                      selected={
                        selected?.kind === 'person' && selected.id === m.id
                      }
                      onClick={() => setSelected({ kind: 'person', id: m.id })}
                      animateDelay={0.5 + (aIdx * 4 + mIdx) * 0.04}
                    />
                  );
                });
              })}
            </AnimatePresence>

            {/* Branch label */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="absolute -translate-x-1/2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim"
              style={{ left: ownerPos.x, top: ownerPos.y - ownerPos.h / 2 - 28 }}
            >
              <span className="rounded-full border border-border-muted bg-surface/60 px-2 py-0.5">
                <Users className="mr-1 inline h-3 w-3" /> People
              </span>
            </motion.div>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border-muted pt-3 text-[11px] text-text-dim">
            <LegendDot color="bg-accent" label="Owner" />
            <LegendDot color="bg-accent4" label="Admin" />
            <LegendDot color="bg-text-dim" label="Member" />
            <span className="ml-auto font-mono text-[10px]">
              {people.length} people
            </span>
          </div>
        </div>

        {/* Inspector drawer */}
        <div className="xl:sticky xl:top-2 xl:self-start">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={`${selected.kind}-${'id' in selected ? selected.id : 'ws'}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.22 }}
              >
                <Inspector
                  selected={selected}
                  workspace={d.workspace}
                  people={people}
                  workspaceCounts={{
                    people: people.length,
                  }}
                  onClose={() => setSelected(null)}
                  onRemove={removeSelected}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-dashed border-border-muted bg-surface/30 p-6 text-center"
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-text-dim">
                  <Users className="h-4 w-4" />
                </div>
                <p className="mt-3 text-sm font-medium text-text">
                  Nothing selected
                </p>
                <p className="mt-1 text-xs text-text-dim">
                  Click any node in the chart to see its details and actions.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connector — animates pathLength from 0→1
// ---------------------------------------------------------------------------

function DrawConnector({
  d,
  delay,
  tone,
  dashed,
}: {
  d: string;
  delay: number;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4' | 'muted';
  dashed?: boolean;
}) {
  const stroke =
    tone === 'accent'
      ? 'rgba(242, 101, 34,0.55)'
      : tone === 'accent2'
      ? 'rgba(255, 138, 75,0.5)'
      : tone === 'accent3'
      ? 'rgba(255,107,74,0.5)'
      : tone === 'accent4'
      ? 'rgba(255,213,79,0.5)'
      : 'rgba(120,120,140,0.45)';
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? '4 5' : undefined}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.7, ease: 'easeOut', delay }}
    />
  );
}

// ---------------------------------------------------------------------------
// Person node
// ---------------------------------------------------------------------------

function PersonNode({
  pos,
  person,
  selected,
  onClick,
  animateDelay,
}: {
  pos: { x: number; y: number; w: number; h: number };
  person: Person;
  selected: boolean;
  onClick: () => void;
  animateDelay: number;
}) {
  const accent = ROLE_ACCENT[person.role];
  const Icon = ROLE_ICON[person.role];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: animateDelay }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      style={nodeStyle(pos)}
      className={`absolute flex flex-col items-stretch justify-center rounded-xl border-2 bg-surface/80 px-3 py-2.5 text-left backdrop-blur-xl transition-shadow ${
        selected ? 'border-accent shadow-[0_0_24px_-8px_rgba(242, 101, 34,0.6)]' : accent.ring
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg border ${accent.ring} bg-surface-2 text-[11px] font-bold ${accent.text}`}
        >
          {nameInitials(person.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{person.name}</p>
          <p className="truncate text-[11px] text-text-dim">{person.email}</p>
        </div>
        <Icon className={`h-3.5 w-3.5 flex-none ${accent.text}`} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-text-dim">
        <span className={`flex items-center gap-1 font-semibold ${accent.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
          {person.role}
        </span>
        <span className="flex items-center gap-1.5 normal-case tracking-normal">
          <span className="flex items-center gap-0.5">
            <Mail className="h-3 w-3" />
            {person.mailboxesAssigned}
          </span>
          <span>·</span>
          <span>{person.lastActiveAgo}</span>
        </span>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Inspector drawer
// ---------------------------------------------------------------------------

function Inspector({
  selected,
  workspace,
  people,
  workspaceCounts,
  onClose,
  onRemove,
}: {
  selected: SelectedNode;
  workspace: WorkspaceInfo;
  people: Person[];
  workspaceCounts: { people: number };
  onClose: () => void;
  onRemove: () => void;
}) {
  // Owner row is needed for the "Reports to" copy under an admin's inspector
  // entry; it falls back gracefully when the workspace has no owner yet.
  const ownerRow = people.find((x) => x.role === 'owner') ?? null;
  if (selected.kind === 'workspace') {
    return (
      <InspectorShell title="Workspace" subtitle={workspace.name} onClose={onClose}>
        <DetailRow label="Slug" value={workspace.slug} mono />
        <DetailRow label="Plan" value={workspace.plan} />
        <DetailRow label="Region" value={workspace.region} />
        <div className="my-3 h-px bg-border-muted" />
        <DetailRow label="People" value={`${workspaceCounts.people}`} />
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="secondary" leftIcon={<Pencil className="h-3.5 w-3.5" />}>
            Rename
          </Button>
        </div>
      </InspectorShell>
    );
  }
  if (selected.kind === 'person') {
    const p = people.find((x) => x.id === selected.id);
    if (!p) {
      return (
        <InspectorShell title="Person" subtitle="Not found" onClose={onClose}>
          <p className="text-sm text-text-dim">This member was removed.</p>
        </InspectorShell>
      );
    }
    const accent = ROLE_ACCENT[p.role];
    const Icon = ROLE_ICON[p.role];
    // Resolve the "reports to" relationship for the inspector so users can see
    // — and reinforce — which admin a member rolls up to. Owner/admin show
    // their position in the hierarchy instead.
    const manager =
      p.role === 'member' && p.managedBy
        ? people.find((x) => x.id === p.managedBy) ?? null
        : null;
    const reportsLine =
      p.role === 'owner'
        ? 'Workspace owner'
        : p.role === 'admin'
        ? ownerRow
          ? `Reports to · ${ownerRow.name} (owner)`
          : 'Reports to · Workspace owner'
        : manager
        ? `Reports to · ${manager.name}`
        : 'Unassigned';
    return (
      <InspectorShell
        title="Person"
        subtitle={p.name}
        onClose={onClose}
        icon={<Icon className={`h-4 w-4 ${accent.text}`} />}
      >
        <DetailRow label="Email" value={p.email} mono />
        <DetailRow
          label="Role"
          value={
            <span className={`font-semibold capitalize ${accent.text}`}>{p.role}</span>
          }
        />
        <DetailRow label="Reports to" value={reportsLine} />
        <DetailRow label="Mailboxes" value={`${p.mailboxesAssigned} assigned`} />
        <DetailRow label="Last active" value={p.lastActiveAgo} />
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="secondary" leftIcon={<Pencil className="h-3.5 w-3.5" />}>
            Edit role
          </Button>
          {p.role !== 'owner' ? (
            <Button
              size="sm"
              variant="danger"
              onClick={onRemove}
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            >
              Remove
            </Button>
          ) : (
            <span className="text-[11px] text-text-dim">Owner cannot be removed</span>
          )}
        </div>
      </InspectorShell>
    );
  }
  return null;
}

function InspectorShell({
  title,
  subtitle,
  onClose,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface/70 p-5 backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            {icon} {title}
          </p>
          <h3 className="mt-0.5 truncate text-base font-semibold text-text">
            {subtitle}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-text-dim transition-colors hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="mt-4 space-y-2.5">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-dim">
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-right ${
          mono ? 'font-mono text-xs' : 'text-text'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline add forms
// ---------------------------------------------------------------------------

function AddPersonForm({
  admins,
  onCancel,
  onAdd,
}: {
  admins: Person[];
  onCancel: () => void;
  onAdd: (
    name: string,
    email: string,
    role: 'admin' | 'member',
    managedBy?: string,
  ) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  // Default the manager to the first admin so a freshly-invited member always
  // lands in a visible column. If there are no admins at all the field is
  // hidden and the add handler will fall back to undefined → owner.
  const [managedBy, setManagedBy] = useState<string>(admins[0]?.id ?? '');
  const valid = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) {
          onAdd(
            name,
            email,
            role,
            role === 'member' ? managedBy || undefined : undefined,
          );
        }
      }}
      className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto_auto] md:items-end"
    >
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Patel" />
      </Field>
      <Field label="Email">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="asha@nimbusoutbound.io"
        />
      </Field>
      <Field label="Role">
        <div className="flex h-10 items-center gap-1 rounded-lg border border-border-muted bg-surface-2/40 p-1">
          {(['member', 'admin'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`rounded-md px-2.5 py-1 text-xs capitalize transition-colors ${
                role === r
                  ? 'bg-accent/15 font-semibold text-accent'
                  : 'text-text-dim hover:text-text'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </Field>
      {role === 'member' && admins.length > 0 ? (
        <Field label="Reports to">
          <select
            value={managedBy}
            onChange={(e) => setManagedBy(e.target.value)}
            className="h-10 w-full rounded-lg border border-border-muted bg-surface-2/40 px-2 text-sm text-text"
          >
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Button type="submit" size="sm" disabled={!valid} leftIcon={<Check className="h-3.5 w-3.5" />}>
        Add
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-dim">
        {label}
      </span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function nodeStyle(pos: { x: number; y: number; w: number; h: number }) {
  return {
    left: pos.x - pos.w / 2,
    top: pos.y - pos.h / 2,
    width: pos.w,
    height: pos.h,
  } as const;
}

export default ProPlusWks1OrgChart;
