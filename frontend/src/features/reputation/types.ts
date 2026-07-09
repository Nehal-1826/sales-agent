/**
 * Reputation & Health feature types (spec §5.1 item 5).
 *
 * Kept intentionally loose — the reputation backend is still TBD and many
 * endpoints may 404 in dev. Hooks in `./api.ts` degrade gracefully.
 */

export interface DomainHealth {
  domain: string;
  spf_valid: boolean | null;
  dkim_valid: boolean | null;
  dmarc_valid: boolean | null;
  reputation_score: number | null;
  blacklist_hits: string[]; // names of blacklists hit
}

export interface BlacklistProviderResult {
  name: string;
  listed: boolean;
}

export interface BlacklistResult {
  domain: string;
  checked_against: string[];
  hits: string[];
  checked_at: string;
  /** Sending IP the IP-based lists were evaluated against (null if unresolved). */
  checked_ip?: string | null;
  /** Per-provider listed/clear breakdown (preferred over checked_against+hits). */
  providers?: BlacklistProviderResult[];
}

export interface ReputationTrendPoint {
  date: string;
  score: number;
}

export interface ReputationOverview {
  domains: DomainHealth[];
  overall_reputation: number; // 0-100 mean across mailboxes
  overall_warmth: number; // 0-100 mean warmth
  bounce_rate: number; // 0-100 percent, inverse health signal
}

export interface PostmasterStatus {
  connected: boolean;
  last_sync_at?: string | null;
  domains_tracked?: number;
}

export interface SndsStatus {
  connected: boolean;
  last_sync_at?: string | null;
  ips_tracked?: number;
}

export interface DnsRollup {
  total_mailboxes: number;
  spf_pct: number;
  dkim_pct: number;
  dmarc_pct: number;
  per_mailbox: Array<{
    id: string;
    email_address: string;
    spf_valid: boolean | null;
    dkim_valid: boolean | null;
    dmarc_valid: boolean | null;
  }>;
}
