import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import { useWorkspace, type SubClient } from '@/features/workspace/api';
import { useAuthStore } from '@/stores/auth';
import type { Mailbox } from '@/features/mailboxes/types';
import type { AgencyMailboxesData } from '@/pages/client/agency/AgMbxP1Glass';

/**
 * Live-data adapter for the Agency-tier "Frosted Glass Cards" mailboxes
 * surface (`pages/client/agency/AgMbxP1Glass.tsx` — the locked-live design).
 *
 * Maps the existing TanStack-Query mailbox + workspace hooks onto the exact
 * `AgencyMailboxesData` shape the glass cards consume. Modelled on the
 * sibling Pro Plus mailboxes adapter.
 *
 * NB on sub-client mapping: the backend doesn't expose a `sub_client_id`
 * on each mailbox row, so we attribute each mailbox to a sub-client by
 * matching the mailbox's email domain against `sub_client.owner_email`'s
 * domain. Mailboxes that don't match any sub-client are bucketed under
 * the agency itself (subClientId = workspace id).
 *
 * Re-export the shape so callers (`mailboxes/AgencyMailboxes`) can import
 * the type from either module.
 */
export type { AgencyMailboxesData } from '@/pages/client/agency/AgMbxP1Glass';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: unknown, dflt = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function domainOf(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

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
  return `${days}d ago`;
}

function logoFor(name: string): string {
  const parts = name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '??';
  if (parts.length === 1) {
    const w = parts[0]!;
    return (w[0] ?? '?').toUpperCase() + (w[1] ?? '').toUpperCase();
  }
  return (
    (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '?').toUpperCase()
  );
}

/** Map backend warmup_status + is_paused → UI mailbox status. */
function uiStatusFor(m: Mailbox): AgencyMailboxesData['mailboxes'][number]['status'] {
  if (m.is_paused) return 'paused';
  if (m.warmup_status === 'paused') return 'paused';
  if (m.warmup_status === 'pending') return 'pending';
  if (m.warmup_status === 'active' || m.warmup_status === 'completed') {
    return num(m.current_day) >= 28 ? 'active' : 'warming';
  }
  return 'warming';
}

function normalizeProvider(
  p: string,
): AgencyMailboxesData['mailboxes'][number]['provider'] {
  if (p === 'gmail' || p === 'outlook' || p === 'yahoo') return p;
  return 'smtp';
}

/** Map current_day → ramp tier label. */
function rampTierFor(day: number): AgencyMailboxesData['mailboxes'][number]['rampTier'] {
  if (day <= 3) return 'D1-3';
  if (day <= 7) return 'D4-7';
  if (day <= 14) return 'D8-14';
  if (day <= 21) return 'D15-21';
  if (day <= 28) return 'D22-28';
  return 'D29+';
}

/**
 * Find the sub-client this mailbox belongs to by matching the email
 * domain against each sub-client's owner_email domain. The agency itself
 * acts as a fallback when no sub-client matches.
 */
function findSubClient(
  m: Mailbox,
  subs: SubClient[],
): SubClient | null {
  const dom = domainOf(m.email_address);
  if (!dom) return null;
  return subs.find((s) => domainOf(s.owner_email) === dom) ?? null;
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export interface UseAgencyMailboxesDataResult {
  data: AgencyMailboxesData | null;
  isLoading: boolean;
}

export function useAgencyMailboxesData(): UseAgencyMailboxesDataResult {
  const workspaceQuery = useWorkspace();
  const mailboxesQuery = useMailboxes();
  const authUser = useAuthStore((s) => s.user);

  const isLoading = workspaceQuery.isLoading || mailboxesQuery.isLoading;

  const data = useMemo<AgencyMailboxesData | null>(() => {
    if (isLoading) return null;
    const ws = workspaceQuery.data;
    if (!ws && !authUser) return null;

    const rawMailboxes: Mailbox[] = mailboxesQuery.data?.items ?? [];
    const subClients: SubClient[] = ws?.sub_clients ?? [];
    const agencyName =
      ws?.name ??
      (authUser?.email
        ? `${authUser.email.split('@')[0]}'s agency`
        : 'Your agency');
    const agencyId = ws ? `agency-${agencyName}` : 'agency-self';

    // ── mailboxes ──────────────────────────────────────────────────
    const mailboxes: AgencyMailboxesData['mailboxes'] = rawMailboxes.map((m) => {
      const sub = findSubClient(m, subClients);
      const subClientId = sub?.id ?? agencyId;
      const subClientName = sub?.name ?? agencyName;
      const status = uiStatusFor(m);
      const day = num(m.current_day);
      return {
        id: m.id,
        emailAddress: m.email_address,
        provider: normalizeProvider(m.provider),
        status,
        // Whole integer — warmth_score is a raw average that would otherwise
        // render as e.g. 76.66666666666667, and every other plan's mailbox
        // view shows warmth with no decimals.
        warmthScore: Math.round(num(m.warmth_score)),
        rampDay: day,
        rampTier: rampTierFor(day),
        dailyTarget: num(m.daily_target),
        sentToday: num(m.sent_today),
        subClientId,
        subClientName,
        subClientLogoChar: logoFor(subClientName),
        spfPass: m.spf_valid === true,
        dkimPass: m.dkim_valid === true,
        dmarcPass: m.dmarc_valid === true,
        lastActivityAgo: relTime(m.last_activity_at ?? m.created_at),
        // TODO: skeleton — backend exposes warmth_sparkline (optional);
        // when absent fall back to an empty-but-stable 7-point ramp.
        last7dTrend:
          m.warmth_sparkline && m.warmth_sparkline.length === 7
            ? m.warmth_sparkline
            : [0, 0, 0, 0, 0, 0, num(m.warmth_score)],
      };
    });

    // ── kpis ───────────────────────────────────────────────────────
    const activeMailboxes = mailboxes.filter((m) => m.status === 'active').length;
    const pausedMailboxes = mailboxes.filter((m) => m.status === 'paused').length;
    const rampedMailboxes = mailboxes.filter((m) => m.rampDay >= 29).length;
    const avgWarmth =
      mailboxes.length === 0
        ? 0
        : Math.round(
            mailboxes.reduce((acc, m) => acc + m.warmthScore, 0) / mailboxes.length,
          );
    const totalSendsToday = mailboxes.reduce((acc, m) => acc + m.sentToday, 0);

    // ── providers ──────────────────────────────────────────────────
    const providerKeys: AgencyMailboxesData['providers'][number]['id'][] = [
      'gmail',
      'outlook',
      'yahoo',
      'smtp',
    ];
    const PROVIDER_LABEL: Record<typeof providerKeys[number], string> = {
      gmail: 'Gmail',
      outlook: 'Outlook',
      yahoo: 'Yahoo',
      smtp: 'SMTP',
    };
    const providers: AgencyMailboxesData['providers'] = providerKeys.map(
      (id) => {
        const ofProvider = mailboxes.filter((m) => m.provider === id);
        const avgW =
          ofProvider.length === 0
            ? 0
            : Math.round(
                ofProvider.reduce((acc, m) => acc + m.warmthScore, 0) /
                  ofProvider.length,
              );
        const sends = ofProvider.reduce((acc, m) => acc + m.sentToday, 0);
        return {
          id,
          label: PROVIDER_LABEL[id],
          mailboxCount: ofProvider.length,
          avgWarmth: avgW,
          sendsToday: sends,
        };
      },
    );

    // ── alerts ─────────────────────────────────────────────────────
    // Synthesise alerts from paused mailboxes. Real alerts will come from
    // a dedicated endpoint once that lands. Capped at 6 so the panel
    // stays readable.
    const alerts: AgencyMailboxesData['alerts'] = mailboxes
      .filter((m) => m.status === 'paused')
      .slice(0, 6)
      .map((m, i) => ({
        id: `alert-${m.id}-${i}`,
        mailboxId: m.id,
        emailAddress: m.emailAddress,
        kind: 'mailbox_paused',
        message: `${m.emailAddress} paused — review settings`,
        ago: m.lastActivityAgo,
        severity: 'warn',
      }));

    return {
      workspace: {
        name: agencyName,
        subClientCount: subClients.length,
        mailboxCount: mailboxes.length,
      },
      kpis: {
        totalMailboxes: mailboxes.length,
        activeMailboxes,
        pausedMailboxes,
        avgWarmth,
        totalSendsToday,
        rampedMailboxes,
      },
      mailboxes,
      providers,
      alerts,
    };
  }, [isLoading, workspaceQuery.data, mailboxesQuery.data, authUser]);

  return { data, isLoading };
}
