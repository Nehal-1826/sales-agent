import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import type { Mailbox } from '@/features/mailboxes/types';
import type {
  MailboxRow,
  Provider,
  Status,
} from '@/pages/client/proplus/ProPlusMbx4Clusters';

/**
 * Live-data adapter for the Pro-Plus "Provider Clusters" mailbox surface
 * (`pages/client/proplus/ProPlusMbx4Clusters.tsx`).
 *
 * Maps the existing TanStack-Query `useMailboxes()` list into the exact
 * `MailboxRow[]` shape the design renders. Modelled on
 * `useProPlusConsoleData.ts`: everything is best-effort — `useMailboxes`
 * already falls back to an empty list on 404, so any per-mailbox metric
 * the backend hasn't materialised yet is zero-filled here, never faked.
 *
 *   - empty workspace (0 mailboxes)  → returns `data: null` (caller shows
 *     the existing "complete onboarding" empty state)
 *   - still loading mailbox list     → `isLoading: true`, `data: null`
 *
 * Re-export the row shape so callers (ProPlusMailboxes) can import the
 * type from either module.
 */
export type {
  MailboxRow,
  Provider,
  Status,
} from '@/pages/client/proplus/ProPlusMbx4Clusters';

const num = (v: unknown, dflt = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
};

// NOTE: the `MailboxRow` shape carries no separate `domain` field — the
// design derives the display name inline via `m.email.split('@')[0]`, so
// there's nothing to resolve here. The local-part / domain split lives in
// the design component, not this adapter.

function normalizeProvider(p: string): Provider {
  if (p === 'gmail' || p === 'outlook' || p === 'yahoo') return p;
  return 'smtp';
}

/**
 * Map the backend mailbox `warmup_status` ('pending' | 'active' | 'paused' |
 * 'completed') onto the Clusters' narrower status vocabulary
 * ('active' | 'warming' | 'paused') — identical to `useProPlusConsoleData`:
 *   - paused                       → paused
 *   - active and finished ramping  → active
 *   - active but still ramping     → warming
 *   - pending / unknown            → warming (it's not live yet, not paused)
 */
function toUiStatus(m: Mailbox): Status {
  if (m.is_paused || m.warmup_status === 'paused') return 'paused';
  if (m.warmup_status === 'active' || m.warmup_status === 'completed') {
    return num(m.current_day) >= 28 ? 'active' : 'warming';
  }
  return 'warming';
}

/**
 * Tri-state DNS flag (true / false / null) → the design's boolean.
 * The Clusters design only models a pass/fail boolean (no "pending"
 * state), so an unchecked record (null) reads as not-yet-passing.
 */
function dnsBool(v: boolean | null | undefined): boolean {
  return v === true;
}

export interface UseProPlusMailboxesDataResult {
  data: MailboxRow[] | null;
  isLoading: boolean;
}

export function useProPlusMailboxesData(): UseProPlusMailboxesDataResult {
  const mailboxesQuery = useMailboxes();
  const mailboxes = mailboxesQuery.data?.items ?? [];

  // Loading: the mailbox list is the only gate (it's the sole data source
  // for this surface, and resolves to an empty list on 404).
  const isLoading = mailboxesQuery.isLoading;

  const data = useMemo<MailboxRow[] | null>(() => {
    if (mailboxesQuery.isLoading) return null;
    if (mailboxes.length === 0) return null;

    return mailboxes.map<MailboxRow>((m) => {
      const sendTarget = Math.round(num(m.ramp_target_today ?? m.daily_target));
      return {
        id: m.id,
        email: m.email_address,
        provider: normalizeProvider(m.provider),
        warmth: Math.round(num(m.warmth_score)),
        // Per-mailbox warmth delta isn't exposed by the list endpoint yet.
        // TODO: no API source yet — zero-fill (never fabricate a trend).
        delta: 0,
        day: Math.round(num(m.current_day)),
        sentToday: Math.round(num(m.sent_today)),
        target: sendTarget,
        status: toUiStatus(m),
        spf: dnsBool(m.spf_valid),
        dkim: dnsBool(m.dkim_valid),
        dmarc: dnsBool(m.dmarc_valid),
      };
    });
  }, [mailboxesQuery.isLoading, mailboxes]);

  return { data, isLoading };
}
