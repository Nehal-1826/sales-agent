/**
 * Write actions for the app — thin wrappers over authFetch that invalidate the
 * relevant read queries on success. Components call these and show feedback
 * (Alert) themselves.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from './api';
import type { Mailbox } from './data';

function jsonBody(method: string, body?: unknown) {
  return { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };
}

/* --------------------------------- mailboxes --------------------------------- */

/** Result of MX-based provider detection (`GET /mailboxes/detect-provider`). */
export type ProviderDetect = {
  provider: string;
  zoho_region?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  imap_host?: string | null;
  imap_port?: number | null;
  note?: string | null;
};

/** Auto-detect SMTP/IMAP hosts from an email's domain MX. Best-effort — never throws on DNS misses. */
export function useDetectProvider() {
  return useMutation({
    mutationFn: (email: string) =>
      authFetch<ProviderDetect>(
        `/api/workspace/mailboxes/detect-provider?email=${encodeURIComponent(email)}`,
      ),
  });
}

export type MailboxCredentials = {
  email_address: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  imap_host?: string | null;
  imap_port?: number | null;
};

/** Verify SMTP (+IMAP) credentials without saving. 200 = good; 400 carries the SMTP/IMAP error. */
export function useProbeMailbox() {
  return useMutation({
    mutationFn: (creds: MailboxCredentials) =>
      authFetch<{ ok?: boolean; smtp_ok?: boolean; imap_ok?: boolean }>(
        '/api/workspace/mailboxes/probe',
        jsonBody('POST', creds),
      ),
  });
}

/** Create + persist a mailbox via the app-password (SMTP/IMAP) flow. Returns the created row. */
export function useCreateMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MailboxCredentials & { daily_target?: number }) =>
      authFetch<Mailbox>(
        '/api/workspace/mailboxes',
        jsonBody('POST', { provider: 'smtp', daily_target: 50, ...input }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

/** Create + persist a mailbox via OAuth (Gmail/Outlook). Returns the created row. */
export type OAuthMailboxInput = {
  provider: 'gmail' | 'outlook';
  email: string;
  oauth_code?: string;
  daily_target?: number;
};
export function useCreateOAuthMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OAuthMailboxInput) =>
      authFetch<Mailbox>(
        '/api/workspace/mailboxes/oauth',
        jsonBody('POST', input),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

export function useMailboxPauseResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pause' | 'resume' }) =>
      authFetch(`/api/workspace/mailboxes/${id}/${action}`, jsonBody('POST')),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

export function useMailboxDnsCheck() {
  return useMutation({
    mutationFn: (id: string) =>
      authFetch<{ spf_valid?: boolean; dkim_valid?: boolean; dmarc_valid?: boolean }>(
        `/api/workspace/mailboxes/${id}/dns-check`,
        jsonBody('POST'),
      ),
  });
}

/* ---------------------------------- reports ---------------------------------- */
export type GenerateReportInput = {
  type: string;
  format: 'pdf' | 'csv';
  from: string;
  to: string;
};
export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateReportInput) =>
      authFetch('/api/workspace/reports/generate', jsonBody('POST', input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

/* ----------------------------------- tools ----------------------------------- */
export type PlacementResult = { test_id?: string; results?: unknown; seed_count?: number };
export function usePlacementTest() {
  return useMutation({
    mutationFn: (mailboxId?: string) =>
      authFetch<PlacementResult>(
        '/api/workspace/tools/placement',
        jsonBody('POST', mailboxId ? { mailbox_id: mailboxId } : {}),
      ),
  });
}

export type SpamScanResult = { score?: number; passed?: boolean; triggers?: string[] };
export function useSpamScan() {
  return useMutation({
    mutationFn: (content: string) =>
      authFetch<SpamScanResult>('/api/workspace/tools/spam-scan', jsonBody('POST', { content })),
  });
}

export type WarmupPreview = { samples?: { subject?: string; body?: string }[] };
export function useWarmupPreview() {
  return useMutation({
    mutationFn: () => authFetch<WarmupPreview>('/api/workspace/tools/warmup-preview', jsonBody('POST', {})),
  });
}

/* ---------------------------------- billing ---------------------------------- */
export function useQuickUpgrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      authFetch(`/api/payments/quick-upgrade?plan_id=${encodeURIComponent(planId)}`, jsonBody('POST')),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['billing-usage'] });
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useSetAutoPay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      authFetch('/api/payments/auto-pay', jsonBody('PATCH', { enabled })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-status'] }),
  });
}

/* --------------------------------- settings ---------------------------------- */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: (display_name: string) =>
      authFetch('/api/workspace/settings/profile', jsonBody('PATCH', { display_name })),
  });
}

export type NotificationPrefs = {
  email_digest_enabled?: boolean;
  alerts?: { warmth_drop?: boolean; bounce_spike?: boolean; dns_break?: boolean };
};
export function useUpdateNotifications() {
  return useMutation({
    mutationFn: (prefs: NotificationPrefs) =>
      authFetch('/api/workspace/settings/notifications', jsonBody('PATCH', prefs)),
  });
}

/* ------------------------------------ 2FA ------------------------------------ */
export type TotpEnrollment = { secret: string; qr_url?: string; recovery_codes?: string[] };
export function useEnroll2FA() {
  return useMutation({
    mutationFn: () =>
      authFetch<TotpEnrollment>('/api/workspace/settings/security/totp/enroll', jsonBody('POST', {})),
  });
}
export function useVerify2FA() {
  return useMutation({
    mutationFn: (code: string) =>
      authFetch<{ enabled: boolean }>(
        '/api/workspace/settings/security/totp/verify',
        jsonBody('POST', { code }),
      ),
  });
}
export function useDisable2FA() {
  return useMutation({
    mutationFn: (password: string) =>
      authFetch('/api/workspace/settings/security/totp/disable', jsonBody('POST', { password })),
  });
}
