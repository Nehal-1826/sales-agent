import type { DemoMailbox, DemoProvider } from '../pro-dashboards/demoData';

/**
 * Shared health-score derivations and tone helpers for Pro Reputation.
 */

export type Tone = 'success' | 'warning' | 'danger';

export function dnsScore(m: DemoMailbox): number {
  const valid =
    (m.spfOk ? 1 : 0) + (m.dkimOk ? 1 : 0) + (m.dmarcOk ? 1 : 0);
  return [30, 60, 80, 100][valid] ?? 0;
}

export function authScore(m: DemoMailbox): number {
  return m.provider === 'gmail' || m.provider === 'outlook' ? 100 : 70;
}

export function compositeScore(m: DemoMailbox): number {
  return Math.round((m.warmth + dnsScore(m) + authScore(m)) / 3);
}

export function toneForScore(score: number): Tone {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

export function authMethod(provider: DemoProvider): string {
  return provider === 'gmail' || provider === 'outlook' ? 'OAuth 2.0' : 'SMTP + App password';
}

export interface MailboxHealth {
  mailbox: DemoMailbox;
  dns: number;
  warmth: number;
  auth: number;
  composite: number;
  tone: Tone;
}

export function getMailboxHealth(m: DemoMailbox): MailboxHealth {
  const dns = dnsScore(m);
  const warmth = m.warmth;
  const auth = authScore(m);
  const composite = Math.round((dns + warmth + auth) / 3);
  return { mailbox: m, dns, warmth, auth, composite, tone: toneForScore(composite) };
}
