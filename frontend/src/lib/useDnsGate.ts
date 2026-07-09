/**
 * App-wide DNS gate.
 *
 * Returns `gateActive = true` when the user has at least one mailbox AND
 * the most-recently-created mailbox has any of `spf_valid` / `dkim_valid`
 * / `dmarc_valid` explicitly set to `false`. A `null` flag means "not
 * checked yet" and does NOT gate (we don't want a brand-new mailbox to
 * lock the app before the first DNS probe lands).
 *
 * Fail-open: any error from `useMailboxes` short-circuits to
 * `gateActive = false` so a backend hiccup can't lock the whole app.
 * The gate is also suppressed during onboarding (`onboarding_status !==
 * 'active'`) because onboarding has its own DNS handling.
 */
import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import { useAuthStore } from '@/stores/auth';
import type { Mailbox } from '@/features/mailboxes/types';

export interface DnsGateResult {
  gateActive: boolean;
  mailbox: Mailbox | null;
  isLoading: boolean;
}

export function useDnsGate(): DnsGateResult {
  const onboardingStatus = useAuthStore((s) => s.user?.onboarding_status ?? null);
  const query = useMailboxes();

  return useMemo<DnsGateResult>(() => {
    // Fail-open: any error → no gate.
    if (query.isError) {
      return { gateActive: false, mailbox: null, isLoading: false };
    }
    // Don't gate during onboarding — that flow handles DNS on its own.
    if (onboardingStatus !== 'active') {
      return { gateActive: false, mailbox: null, isLoading: query.isLoading };
    }

    const items = query.data?.items ?? [];
    if (items.length === 0) {
      // No mailboxes at all → onboarding will route them elsewhere.
      return { gateActive: false, mailbox: null, isLoading: query.isLoading };
    }

    // Pick the most-recently-created mailbox as the "primary".
    const primary =
      [...items].sort((a, b) => {
        const ta = Date.parse(a.created_at);
        const tb = Date.parse(b.created_at);
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      })[0] ?? null;

    if (!primary) {
      return { gateActive: false, mailbox: null, isLoading: query.isLoading };
    }

    const fails =
      primary.spf_valid === false ||
      primary.dkim_valid === false ||
      primary.dmarc_valid === false;

    return {
      gateActive: fails,
      mailbox: primary,
      isLoading: query.isLoading,
    };
  }, [query.isError, query.isLoading, query.data, onboardingStatus]);
}
