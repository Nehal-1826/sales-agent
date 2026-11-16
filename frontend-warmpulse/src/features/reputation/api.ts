import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { useMailboxes } from '@/features/mailboxes/api';
import type { Mailbox } from '@/features/mailboxes/types';
import type {
  BlacklistResult,
  DnsRollup,
  DomainHealth,
  PostmasterStatus,
  ReputationOverview,
  ReputationTrendPoint,
  SndsStatus,
} from './types';

/**
 * Reputation & health data hooks.
 *
 * All endpoints are best-effort — the reputation integrations (Postmaster, SNDS,
 * blacklist providers) land in a later phase, so every hook returns a sensible
 * fallback on 404 so the UI renders placeholders rather than empty screens.
 */

function isAxios404(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 404;
}

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

function deriveDomainsFromMailboxes(mailboxes: Mailbox[]): DomainHealth[] {
  const byDomain = new Map<string, Mailbox[]>();
  for (const m of mailboxes) {
    const d = domainOf(m.email_address);
    const list = byDomain.get(d) ?? [];
    list.push(m);
    byDomain.set(d, list);
  }
  const out: DomainHealth[] = [];
  for (const [domain, items] of byDomain) {
    const rep =
      items.reduce((acc, m) => acc + (Number(m.warmth_score) || 0), 0) / items.length;
    // Domain-level DNS: "all green" means every mailbox is valid; otherwise
    // fall back to the first non-null value we see (best-effort rollup).
    const pickBool = (k: 'spf_valid' | 'dkim_valid' | 'dmarc_valid') => {
      if (items.every((m) => m[k] === true)) return true;
      if (items.some((m) => m[k] === false)) return false;
      return null;
    };
    out.push({
      domain,
      spf_valid: pickBool('spf_valid'),
      dkim_valid: pickBool('dkim_valid'),
      dmarc_valid: pickBool('dmarc_valid'),
      reputation_score: Math.round(rep),
      blacklist_hits: [],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Overview (domains + aggregate)
// ---------------------------------------------------------------------------

export function useReputationOverview(): UseQueryResult<ReputationOverview> {
  const mailboxes = useMailboxes();

  return useQuery({
    queryKey: ['reputation', 'overview'],
    staleTime: 60_000,
    enabled: !mailboxes.isLoading,
    queryFn: async () => {
      const items = mailboxes.data?.items ?? [];
      const deriveFallback = (): ReputationOverview => {
        const domains = deriveDomainsFromMailboxes(items);
        const mean =
          items.length === 0
            ? 0
            : items.reduce((acc, m) => acc + (Number(m.warmth_score) || 0), 0) / items.length;
        return {
          domains,
          overall_reputation: Math.round(mean),
          overall_warmth: Math.round(mean),
          bounce_rate: 0,
        };
      };

      try {
        const res = await api.get('/workspace/reputation/overview');
        const data = res.data as Partial<ReputationOverview> & Record<string, unknown>;
        const fallback = deriveFallback();
        return {
          ...fallback,
          ...data,
          domains:
            Array.isArray(data.domains) && data.domains.length > 0
              ? (data.domains as DomainHealth[])
              : fallback.domains,
        } as ReputationOverview;
      } catch (err) {
        if (isAxios404(err)) return deriveFallback();
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Blacklist
// ---------------------------------------------------------------------------

export function useBlacklistCheck(domain: string | null | undefined) {
  return useQuery<BlacklistResult | null>({
    queryKey: ['reputation', 'blacklist', domain],
    enabled: !!domain,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/reputation/blacklist', {
          params: { domain },
        });
        return res.data as BlacklistResult;
      } catch (err) {
        if (isAxios404(err)) return null;
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Postmaster / SNDS placeholders
// ---------------------------------------------------------------------------

export function usePostmasterStatus(): UseQueryResult<PostmasterStatus> {
  return useQuery({
    queryKey: ['reputation', 'postmaster'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/reputation/postmaster/status');
        return res.data as PostmasterStatus;
      } catch (err) {
        if (isAxios404(err)) return { connected: false };
        throw err;
      }
    },
  });
}

export function useSndsStatus(): UseQueryResult<SndsStatus> {
  return useQuery({
    queryKey: ['reputation', 'snds'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/reputation/snds/status');
        return res.data as SndsStatus;
      } catch (err) {
        if (isAxios404(err)) return { connected: false };
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Trend (line chart)
// ---------------------------------------------------------------------------

export function useReputationTrend(
  mailboxId?: string | null,
): UseQueryResult<ReputationTrendPoint[]> {
  const mailboxes = useMailboxes();

  return useQuery({
    queryKey: ['reputation', 'trend', mailboxId ?? 'workspace'],
    staleTime: 60_000,
    enabled: !mailboxes.isLoading,
    queryFn: async () => {
      const fallback = (): ReputationTrendPoint[] => {
        // Synthesize a flat trend from current warmth so the chart is never empty.
        const items = mailboxes.data?.items ?? [];
        const mean =
          items.length === 0
            ? 0
            : items.reduce((acc, m) => acc + (Number(m.warmth_score) || 0), 0) / items.length;
        const today = new Date();
        return Array.from({ length: 30 }).map((_, i) => {
          const d = new Date(today);
          d.setDate(today.getDate() - (29 - i));
          const jitter = Math.sin(i / 3) * 2;
          return {
            date: d.toISOString().slice(0, 10),
            score: Math.max(0, Math.min(100, Math.round(mean + jitter))),
          };
        });
      };

      try {
        const res = await api.get('/workspace/reputation/trend', {
          params: mailboxId ? { mailbox_id: mailboxId } : undefined,
        });
        const data = res.data as unknown;
        if (Array.isArray(data)) return data as ReputationTrendPoint[];
        if (data && typeof data === 'object' && 'points' in data) {
          const points = (data as { points: ReputationTrendPoint[] }).points;
          return Array.isArray(points) ? points : fallback();
        }
        return fallback();
      } catch (err) {
        if (isAxios404(err)) return fallback();
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// DNS rollup (aggregate SPF/DKIM/DMARC across mailboxes)
// ---------------------------------------------------------------------------

// ─── Domain reputation (Postmaster + SNDS) ────
// Hooks for the Pro Plus "External Signals" section. Sub-B appends SNDS-
// specific hooks below this block.

export interface DomainReputationSnapshotFields {
  date: string;
  spam_rate: number | null;
  complaint_rate: number | null;
  ip_reputation: string | null;
  domain_reputation: string | null;
  auth_pass_pct: number | null;
}

export interface DomainReputation {
  id: string;
  domain: string;
  provider: 'postmaster' | 'snds';
  is_active: boolean;
  last_pulled_at: string | null;
  last_status: string | null;
  created_at: string;
  latest_snapshot: DomainReputationSnapshotFields | null;
}

export interface DomainReputationSplit {
  postmaster: DomainReputation[];
  snds: DomainReputation[];
}

async function fetchListSafe<T>(path: string): Promise<T[]> {
  try {
    const res = await api.get(path);
    return Array.isArray(res.data) ? (res.data as T[]) : [];
  } catch (err) {
    if (isAxios404(err)) return [];
    throw err;
  }
}

export function useDomainReputation(): UseQueryResult<DomainReputationSplit> {
  return useQuery({
    queryKey: ['reputation', 'domain-reputation'],
    staleTime: 60_000,
    queryFn: async () => {
      const [postmaster, snds] = await Promise.all([
        fetchListSafe<DomainReputation>('/workspace/postmaster/domains'),
        fetchListSafe<DomainReputation>('/workspace/snds/domains'),
      ]);
      return { postmaster, snds };
    },
  });
}

/**
 * Open the Google OAuth popup for connecting a Postmaster domain. Returns
 * a callable that, when invoked with a domain, requests the auth URL from
 * the backend and opens a popup. The caller is responsible for listening
 * for the postMessage 'postmaster_connected' to know when to invalidate
 * the query.
 */
export function useStartPostmasterConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (domain: string) => {
      const res = await api.get('/workspace/postmaster/oauth-start', {
        params: { domain },
      });
      const url = (res.data as { auth_url: string }).auth_url;
      // Pop a centred window so the user clearly sees Google's consent.
      const w = 520;
      const h = 640;
      const left =
        typeof window !== 'undefined'
          ? window.screenX + (window.outerWidth - w) / 2
          : 0;
      const top =
        typeof window !== 'undefined'
          ? window.screenY + (window.outerHeight - h) / 2
          : 0;
      window.open(
        url,
        'postmaster-oauth',
        `width=${w},height=${h},left=${left},top=${top}`,
      );
      return { auth_url: url };
    },
    onSuccess: () => {
      // Invalidate after a short delay so the popup has time to land.
      // The caller may also listen to a postMessage to re-invalidate.
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['reputation', 'domain-reputation'] });
      }, 4_000);
    },
  });
}

/**
 * Disconnect a Postmaster or SNDS credential by id. The route differs by
 * provider but the call signature is uniform.
 */
export function useDisconnectReputationSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      provider,
      id,
    }: {
      provider: 'postmaster' | 'snds';
      id: string;
    }) => {
      await api.delete(`/workspace/${provider}/domains/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reputation', 'domain-reputation'] });
    },
  });
}

// ─── SNDS hooks ───
//
// Microsoft SNDS connect flow: user pastes a domain + access key. The
// backend validates the key by fetching one CSV before persisting it,
// so the mutation may 400 with "Invalid SNDS access key or domain".
// ``useDomainReputation`` (above) is invalidated on success so the
// SndsCard flips from CTA to populated state.

export interface ConnectSndsBody {
  domain: string;
  access_key: string;
}

export function useConnectSnds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ConnectSndsBody) => {
      const res = await api.post('/workspace/snds/domains', body);
      return res.data as DomainReputation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reputation', 'domain-reputation'] });
    },
  });
}

// ─── DNS rollup (legacy) ────
export function useDnsRollup(): UseQueryResult<DnsRollup> {
  const mailboxes = useMailboxes();

  return useQuery({
    queryKey: ['reputation', 'dns-rollup'],
    staleTime: 30_000,
    enabled: !mailboxes.isLoading,
    queryFn: async () => {
      const items = mailboxes.data?.items ?? [];
      const total = items.length;
      const count = (key: 'spf_valid' | 'dkim_valid' | 'dmarc_valid') =>
        items.filter((m) => m[key] === true).length;
      const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
      return {
        total_mailboxes: total,
        spf_pct: pct(count('spf_valid')),
        dkim_pct: pct(count('dkim_valid')),
        dmarc_pct: pct(count('dmarc_valid')),
        per_mailbox: items.map((m) => ({
          id: m.id,
          email_address: m.email_address,
          spf_valid: m.spf_valid,
          dkim_valid: m.dkim_valid,
          dmarc_valid: m.dmarc_valid,
        })),
      };
    },
  });
}
