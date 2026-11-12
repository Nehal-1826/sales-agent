import { useMemo } from 'react';
import {
  useWorkspace,
  type TeamMember,
  type WorkspaceData,
} from '@/features/workspace/api';
import { useAuthStore } from '@/stores/auth';
import {
  ORG_CHART_SKELETON,
  type OrgChartData,
  type Person,
  type WorkspaceInfo,
} from '@/pages/client/proplus/ProPlusWks1OrgChart';

/**
 * Live-data adapter for the Pro-Plus "Org Chart" workspace surface
 * (`pages/client/proplus/ProPlusWks1OrgChart.tsx`).
 *
 * Maps the existing TanStack-Query workspace hook onto the exact
 * `OrgChartData` shape the chart consumes. Modelled on
 * `useProPlusCanvasData.ts` / `useProPlusSignalMapData.ts`: real data where
 * a hook surfaces it, skeleton values elsewhere (no fabrication).
 *
 *   - no workspace + 0 team members         → `data: null`
 *     (caller shows the "complete onboarding" EmptyState)
 *   - still loading the primary workspace   → `isLoading: true`, `data: null`
 *
 * NB on `managedBy`: the backend has no notion of "this member reports to that
 * admin". To keep the org-chart's column-per-admin layout meaningful we
 * synthesise the relationship here with a deterministic round-robin
 * assignment: each non-owner / non-admin member is bucketed onto the admins
 * in order. If there are no admins, every member rolls up to the owner. This
 * is a UI-only construct — flagged with a TODO so a real "manager" column on
 * the team_members table (when it lands) drops straight in.
 *
 * Re-export the shape so callers (`workspace/ProPlusWorkspace`) can import the
 * type from either module.
 */
export type {
  OrgChartData,
  Person,
  WorkspaceInfo,
} from '@/pages/client/proplus/ProPlusWks1OrgChart';

function relTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'never';
  const ms = Date.now() - t;
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  // Turn `mateo.reyes` / `mateo-reyes` / `mateo_reyes` into "Mateo Reyes"
  // — workspace API only exposes the email so we derive a readable display
  // name. The component's avatar / initials already prefer first+last so a
  // 2-part split is enough.
  const parts = local
    .split(/[._\-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  if (parts.length === 0) return local;
  return parts.join(' ');
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Map a team_members[] row → org-chart `Person`. */
function toPerson(m: TeamMember): Person {
  return {
    id: m.id,
    name: nameFromEmail(m.email),
    email: m.email,
    role: m.role,
    lastActiveAgo: relTime(m.accepted_at ?? m.invited_at),
    // TODO: skeleton — no per-member mailbox-count on the team_members row.
    // Leave the number off (0) until a join surfaces the real assignment.
    mailboxesAssigned: 0,
    // managedBy is filled in by `assignManagers` below.
  };
}

/**
 * Stamp `managedBy` on each member via deterministic round-robin.
 *
 * TODO: no managedBy in backend yet — round-robin assignment.
 * When the team_members table gains a `manager_id` (or equivalent) column we
 * just thread `m.manager_id` through `toPerson` and drop this function.
 */
function assignManagers(people: Person[]): Person[] {
  const owner = people.find((p) => p.role === 'owner');
  const admins = people.filter((p) => p.role === 'admin');
  const members = people.filter((p) => p.role === 'member');

  // Build the index-based round-robin lookup so member ordering is stable.
  const memberRoundRobin = new Map<string, string | undefined>();
  members.forEach((m, i) => {
    if (admins.length > 0) {
      const a = admins[i % admins.length]!;
      memberRoundRobin.set(m.id, a.id);
    } else if (owner) {
      memberRoundRobin.set(m.id, owner.id);
    } else {
      memberRoundRobin.set(m.id, undefined);
    }
  });

  // Reproject the full ordered list with managedBy stamped.
  return people.map((p) =>
    p.role === 'member' ? { ...p, managedBy: memberRoundRobin.get(p.id) } : p,
  );
}

function mapWorkspaceInfo(ws: WorkspaceData): WorkspaceInfo {
  return {
    name: ws.name,
    slug: slugFromName(ws.name),
    // Workspace `plan` is a lowercase enum on the wire (`pro`, `pro_plus`,
    // `agency`). Surface a Title-Case-ish label so the chip reads naturally.
    plan: ws.plan
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
    // TODO: skeleton — no region field on the workspace payload yet.
    region: ORG_CHART_SKELETON.workspace.region,
  };
}

export interface UseProPlusWorkspaceDataResult {
  data: OrgChartData | null;
  isLoading: boolean;
}

export function useProPlusWorkspaceData(): UseProPlusWorkspaceDataResult {
  const workspaceQuery = useWorkspace();
  // The auth store user is the workspace OWNER. When the workspace API
  // returns nothing (or returns a payload without team_members), we
  // synthesise the owner from this so the chart always reflects the
  // signed-in user rather than falling back to demo data.
  const authUser = useAuthStore((s) => s.user);

  const ws = workspaceQuery.data ?? null;
  const isLoading = workspaceQuery.isLoading;

  const data = useMemo<OrgChartData | null>(() => {
    if (workspaceQuery.isLoading) return null;
    // We need at least ONE source of identity — either a live workspace
    // payload OR the auth-store user. With neither, the chart can't
    // honestly show "your" data, so let the wrapper fall through to
    // skeleton.
    if (!ws && !authUser) return null;

    // ── workspace info ─────────────────────────────────────────────
    // Prefer the live workspace row; otherwise synthesise from the
    // signed-in user so the header chip reads as "<your> workspace ·
    // <your plan>" instead of the demo "Nimbus Outbound · Pro Plus".
    const workspace: WorkspaceInfo = ws
      ? mapWorkspaceInfo(ws)
      : {
          name: authUser?.email
            ? `${authUser.email.split('@')[0]}'s workspace`
            : 'Workspace',
          slug: slugFromName(
            authUser?.email
              ? `${authUser.email.split('@')[0]}-workspace`
              : 'workspace',
          ),
          plan: (() => {
            const raw = (authUser?.plan ?? '').toString();
            return (
              raw
                .split(/[_\s]+/)
                .filter(Boolean)
                .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                .join(' ') || 'Free'
            );
          })(),
          region: ORG_CHART_SKELETON.workspace.region,
        };

    // ── people ─────────────────────────────────────────────────────
    // Prefer the live team_members; when empty (or workspace missing
    // entirely), synthesise a single owner Person from the auth user.
    let people: Person[] = [];
    if (ws && (ws.team_members?.length ?? 0) > 0) {
      people = assignManagers((ws.team_members ?? []).map(toPerson));
    } else if (authUser) {
      people = [
        {
          id: authUser.id,
          name: authUser.name?.trim() || nameFromEmail(authUser.email),
          email: authUser.email,
          role: 'owner',
          lastActiveAgo: 'now',
          mailboxesAssigned: 0,
        },
      ];
    }

    return { workspace, people };
  }, [workspaceQuery.isLoading, ws, authUser]);

  return { data, isLoading };
}
