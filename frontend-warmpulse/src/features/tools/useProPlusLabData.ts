import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import type { Mailbox as ApiMailbox } from '@/features/mailboxes/types';
import {
  LAB_SKELETON,
  type LabData,
  type Mailbox as LabMailbox,
} from '@/pages/client/proplus/ProPlusTool2Lab';

/**
 * Live-data adapter for the Pro-Plus "Experiment Lab" surface
 * (`pages/client/proplus/ProPlusTool2Lab.tsx`).
 *
 * Maps the existing TanStack-Query mailbox hook onto the exact `LabData`
 * shape the lab bench consumes. Modelled on
 * `reputation/useProPlusSignalMapData.ts`: everything is best-effort and we
 * NEVER fabricate numbers — any surface with no real API source keeps the
 * exported skeleton value and is flagged with a `// TODO: no API source —
 * skeleton value` comment.
 *
 *   - empty workspace (0 mailboxes) → returns `data: null` (caller shows the
 *     existing "complete onboarding" empty state)
 *   - still loading mailbox list    → `isLoading: true`, `data: null`
 *
 * TOPOLOGY vs DATA: the lab is largely a DESIGN construct. We start from the
 * design's exported `LAB_SKELETON` and overlay ONLY the one surface we can
 * source from a real hook — the specimen / mailbox rack (`useMailboxes`).
 * The 30-well seed-plate assay, the per-provider sub-plates, the prior-run
 * ledger, the spectrometer sample and the warmup-preview vials have NO
 * structural API source:
 *   - `usePlacementTests()` returns aggregate per-provider counts
 *     (`PlacementResults`) with NO well-level layout, `completedAt`, run
 *     `ref`, or the interleaved 6×5 scatter the plate animation needs —
 *     deriving wells from it would be fabrication, so it is intentionally
 *     NOT consumed here.
 *   - the spectrometer / vial samples are dry on-demand mutations
 *     (`useRunSpamScan` / `useWarmupPreview`), not queryable state.
 * Those keep the skeleton value (same honesty rule as
 * `useProPlusSignalMapData.ts` — no synthetic numbers).
 *
 * Re-export the shape so callers (`tools/ProPlusTools`) can import the type
 * from either module.
 */
export type {
  AssayRun,
  Bucket,
  FlaggedCompound,
  LabData,
  Mailbox,
  PriorRun,
  Provider,
  ProviderBreakdown,
  SpectrometerSample,
  Station,
  StationId,
  VialSample,
  Well,
} from '@/pages/client/proplus/ProPlusTool2Lab';

/** Narrow the workspace `MailboxProvider` onto the lab's provider union
 *  (identical members today — defensive in case the API adds a value). */
function labProvider(p: ApiMailbox['provider']): LabMailbox['provider'] {
  return p === 'gmail' || p === 'outlook' || p === 'yahoo' || p === 'smtp'
    ? p
    : 'smtp';
}

export interface UseProPlusLabDataResult {
  data: LabData | null;
  isLoading: boolean;
}

export function useProPlusLabData(): UseProPlusLabDataResult {
  const mailboxesQuery = useMailboxes();

  const mailboxes = mailboxesQuery.data?.items ?? [];

  // Loading: the mailbox list is the only gate (it decides whether this
  // workspace has anything to mount on the bench). There is no other live
  // query to block on — the rest of the bench is skeleton-sourced.
  const isLoading = mailboxesQuery.isLoading;

  const data = useMemo<LabData | null>(() => {
    if (mailboxesQuery.isLoading) return null;
    if (mailboxes.length === 0) return null;

    // Overlay ONLY the specimen / mailbox rack from real workspace data.
    const rack: LabMailbox[] = mailboxes.map((m) => ({
      id: m.id,
      email: m.email_address,
      provider: labProvider(m.provider),
    }));

    return {
      ...LAB_SKELETON,
      // Real — connected workspace mailboxes (the specimen rack the
      // Placement assay inoculates from).
      mailboxes: rack,
      // TODO: no API source — skeleton value. The station list is a fixed
      // design taxonomy of the four bench instruments, not server state.
      stations: LAB_SKELETON.stations,
      // TODO: no API source — skeleton value. `PlacementResults` carries
      // aggregate per-provider counts only; it has no well-level layout,
      // completedAt, or the interleaved 6×5 scatter the plate animation
      // requires. Deriving wells from it would be fabrication.
      assay: LAB_SKELETON.assay,
      // TODO: no API source — skeleton value. `usePlacementTests()` exposes
      // no run `ref` / `when` / `wells` count in the shape the ledger strip
      // needs; not synthesised.
      priors: LAB_SKELETON.priors,
      // TODO: no API source — skeleton value. The spectrometer reading is a
      // dry on-demand mutation (`useRunSpamScan`), not queryable state.
      spectro: LAB_SKELETON.spectro,
      // TODO: no API source — skeleton value. Sample vials are a dry
      // on-demand mutation (`useWarmupPreview`), not queryable state.
      vials: LAB_SKELETON.vials,
    };
  }, [mailboxesQuery.isLoading, mailboxes]);

  return { data, isLoading };
}
