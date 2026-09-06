import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import { api } from '@/lib/api';

/**
 * Mailbox creation payload. Mirrors the shape the backend
 * will accept at POST /api/workspace/mailboxes. Plaintext SMTP password
 * travels over TLS; backend Fernet-encrypts at rest (spec §4.1).
 */
export interface CreateMailboxPayload {
  provider: 'gmail' | 'outlook' | 'outlook_oauth' | 'yahoo' | 'zoho' | 'smtp';
  email_address: string;
  /** Kept for frontend callers — mapped to backend `daily_target`. */
  daily_volume?: number;
  daily_target?: number;
  content_mode: 'A' | 'B' | 'C' | 'D';
  // OAuth-flavoured — backend expects `oauth_refresh_token`.
  oauth_token?: string | null;
  oauth_refresh_token?: string | null;
  // SMTP/IMAP-flavoured
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_username?: string | null;
  smtp_password?: string | null;
  imap_host?: string | null;
  imap_port?: number | null;
  schedule_window?: {
    tz: string;
    weekday_mask: number;
    start_hour: number;
    end_hour: number;
  } | null;
}

export interface CreateMailboxResponse {
  id: string;
  email_address: string;
  provider: string;
  status: string;
}

export function useCreateMailbox(): UseMutationResult<
  CreateMailboxResponse,
  unknown,
  CreateMailboxPayload
> {
  return useMutation<CreateMailboxResponse, unknown, CreateMailboxPayload>({
    mutationFn: async (payload) => {
      // The wire shape is decided by what the caller supplied, not by the
      // tile label: SMTP credentials present → SMTP/IMAP create (provider
      // 'gmail'/'outlook'/'zoho' app-password tiles map to wire 'smtp',
      // matching backend MailboxCreateSmtp's Literal); otherwise → OAuth
      // refresh-token create (backend MailboxCreateOauth).
      const isSmtp = !!payload.smtp_password || !!payload.smtp_host;
      const wireProvider = !isSmtp
        ? payload.provider === 'outlook_oauth'
          ? 'outlook'
          : payload.provider
        : payload.provider === 'yahoo'
          ? 'yahoo'
          : 'smtp';
      const body: Record<string, unknown> = {
        provider: wireProvider,
        email_address: payload.email_address,
        content_mode: payload.content_mode,
        daily_target: payload.daily_target ?? payload.daily_volume ?? 50,
      };
      if (isSmtp) {
        body.smtp_host = payload.smtp_host;
        body.smtp_port = payload.smtp_port ?? 587;
        body.smtp_username = payload.smtp_username;
        body.smtp_password = payload.smtp_password;
        if (payload.imap_host) body.imap_host = payload.imap_host;
        if (payload.imap_port) body.imap_port = payload.imap_port;
      } else {
        body.oauth_refresh_token = payload.oauth_refresh_token ?? payload.oauth_token ?? '';
      }
      const res: AxiosResponse<CreateMailboxResponse> = await api.post(
        '/workspace/mailboxes',
        body,
      );
      return res.data;
    },
  });
}

/**
 * DNS validator probe. Backend may return 404 in Phase 1 — the caller is expected
 * to branch on that and render a skip-friendly UI. See Step4DnsCheck.
 */
export interface DnsCheckResponse {
  spf_valid: boolean;
  dkim_valid: boolean;
  dmarc_valid: boolean;
  fixes?: Array<{ record: 'spf' | 'dkim' | 'dmarc'; instructions: string }>;
}

export function useDnsCheck(): UseMutationResult<
  DnsCheckResponse,
  unknown,
  { email_address: string }
> {
  return useMutation<DnsCheckResponse, unknown, { email_address: string }>({
    mutationFn: async (payload) => {
      // Backend endpoint is /api/workspace/dns/check with {email} (or {domain}).
      const res: AxiosResponse<{
        spf: { valid: boolean };
        dkim: { valid: boolean };
        dmarc: { valid: boolean };
        fixes?: Record<string, string[]>;
      }> = await api.post('/workspace/dns/check', { email: payload.email_address });
      const { spf, dkim, dmarc, fixes } = res.data;
      const fixesList: Array<{ record: 'spf' | 'dkim' | 'dmarc'; instructions: string }> = [];
      for (const rec of ['spf', 'dkim', 'dmarc'] as const) {
        const lines = fixes?.[rec];
        if (Array.isArray(lines) && lines.length > 0) {
          fixesList.push({ record: rec, instructions: lines.join('\n') });
        }
      }
      return {
        spf_valid: spf.valid,
        dkim_valid: dkim.valid,
        dmarc_valid: dmarc.valid,
        fixes: fixesList,
      };
    },
  });
}
