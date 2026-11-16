/**
 * Webmail client for the Mail page — IMAP-backed read/send/mark over the
 * Django API (`/api/webmail/…`). List shapes follow the endpoints.ts
 * convention: bare arrays for plain lists (`accounts`, `folders`), a wrapped
 * `{items, total, page}` only where the payload is paginated (`messages`).
 * The accounts getter additionally tolerates an `{items: […]}` wrap at
 * runtime — the split-build contract showed both notations.
 *
 * IMAP round-trips are slow, so folder/message reads get 30s timeouts.
 * Demo mode mirrors getMailboxes(): getters return empty, mutations fail
 * with the standard demo-only message.
 */

import { attempt, inDemo, post, request } from './transport';
import type { Result } from './transport';

/**
 * DEV-ONLY sample data switch. Default false — the Mail page talks to the
 * real API. Flip to true by hand to render the page without a backend
 * (three sample accounts, folders with counts, a two-page inbox with an
 * unread thread, one degraded account for the switcher error chip).
 * Used for UI validation screenshots; the real API is verified in the gate.
 */
export const WEBMAIL_MOCK = false;

/* ------------------------------------------------------------------ */
/* Wire types                                                          */
/* ------------------------------------------------------------------ */

export type WebmailFolderName = 'INBOX' | 'Sent' | 'Drafts' | 'Junk' | 'Trash';

export const WEBMAIL_FOLDERS: WebmailFolderName[] = ['INBOX', 'Sent', 'Drafts', 'Junk', 'Trash'];

export interface WebmailAccount {
  id: number;
  email: string;
  provider: string;
  is_primary: boolean;
  /** null when the account can't be reached (unread count unknown). */
  unread: number | null;
  /** G1's purpose-built degrade signal — chip this account in the switcher. */
  unreachable?: boolean;
  /** why the account is unreachable, when the server says so. */
  error?: string;
}

export interface WebmailFolder {
  name: WebmailFolderName;
  count: number;
  unread: number;
}

export interface WebmailMessageSummary {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
  flagged: boolean;
  snippet: string;
}

export interface WebmailMessageList {
  items: WebmailMessageSummary[];
  total: number;
  page: number;
}

export interface WebmailMessageDetail {
  uid: number;
  from: string;
  /** server sends an array of recipient addresses */
  to: string[];
  subject: string;
  date: string;
  html: string | null;
  text: string;
  seen: boolean;
  /** the real Message-ID header — replies thread on this, NEVER the uid. */
  message_id: string | null;
}

export interface WebmailSendInput {
  to: string;
  subject: string;
  body_html: string;
  /** Message-ID of the message being answered (optional string) — omit for new threads. */
  in_reply_to?: string;
}

export type WebmailMarkAction = 'seen' | 'unread' | 'flagged' | 'trash';

/** mark/ reply — per-uid counts; `failed > 0` means a partial failure. */
export interface WebmailMarkResult {
  ok: number;
  failed?: number;
  expunged?: number;
}

const DEMO_ONLY = 'This is the offline demo. Connect your workspace to do that.';
const demoFail = <T>(): Result<T> => ({ ok: false, error: DEMO_ONLY });

/** Mock pagination page size (small so the pager is visible in screenshots). */
const PAGE_SIZE = 5;

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export async function getWebmailAccounts(): Promise<WebmailAccount[]> {
  if (WEBMAIL_MOCK) return mockAccounts();
  if (await inDemo()) return [];
  const res = await request<WebmailAccount[] | { items: WebmailAccount[] }>(
    '/webmail/accounts/',
    undefined,
    20_000,
  );
  return Array.isArray(res) ? res : res.items;
}

export async function getWebmailFolders(accountId: number): Promise<WebmailFolder[]> {
  if (WEBMAIL_MOCK) return mockFolders(accountId);
  if (await inDemo()) return [];
  return request<WebmailFolder[]>(`/webmail/${accountId}/folders/`, undefined, 30_000);
}

export async function getWebmailMessages(
  accountId: number,
  opts: { folder: WebmailFolderName; page?: number; query?: string },
): Promise<WebmailMessageList> {
  const page = opts.page ?? 1;
  if (WEBMAIL_MOCK) return mockMessages(accountId, opts.folder, page, opts.query ?? '');
  if (await inDemo()) return { items: [], total: 0, page };
  const q = new URLSearchParams({ folder: opts.folder, page: String(page) });
  if (opts.query) q.set('query', opts.query);
  return request<WebmailMessageList>(`/webmail/${accountId}/messages/?${q.toString()}`, undefined, 30_000);
}

export async function getWebmailMessageDetail(
  accountId: number,
  folder: WebmailFolderName,
  uid: number,
): Promise<WebmailMessageDetail> {
  if (WEBMAIL_MOCK) return mockDetail(accountId, folder, uid);
  if (await inDemo()) throw new Error(DEMO_ONLY);
  const q = new URLSearchParams({ folder, uid: String(uid) });
  return request<WebmailMessageDetail>(`/webmail/${accountId}/message/?${q.toString()}`, undefined, 30_000);
}

export async function sendWebmail(accountId: number, input: WebmailSendInput): Promise<Result<unknown>> {
  if (WEBMAIL_MOCK) return mockSend(accountId, input);
  if (await inDemo()) return demoFail();
  return attempt(() => request<unknown>(`/webmail/${accountId}/send/`, post(input), 30_000));
}

export async function markWebmail(
  accountId: number,
  folder: WebmailFolderName,
  uids: number[],
  action: WebmailMarkAction,
): Promise<Result<WebmailMarkResult>> {
  if (WEBMAIL_MOCK) return mockMark(accountId, folder, uids, action);
  if (await inDemo()) return demoFail();
  return attempt(() => request<WebmailMarkResult>(`/webmail/${accountId}/mark/`, post({ folder, uids, action }), 30_000));
}

/* ------------------------------------------------------------------ */
/* WEBMAIL_MOCK sample data — dev validation only                      */
/* ------------------------------------------------------------------ */

interface MockMessage extends WebmailMessageDetail {
  snippet: string;
  flagged: boolean;
}

type MockStore = Record<number, Partial<Record<WebmailFolderName, MockMessage[]>>>;

const minsAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

/** literals are written compactly (single `to`, optional message_id) — wire()
 *  lifts them onto the real shapes: `to` array + Message-ID header. */
type RawMockMessage = Omit<MockMessage, 'to' | 'message_id'> & { to: string; message_id?: string | null };

const wire = (list: RawMockMessage[]): MockMessage[] =>
  list.map((m) => ({
    ...m,
    to: [m.to],
    message_id: m.message_id ?? `<${m.uid}.mock@shailog.tech>`,
  }));

function buildMockStore(): MockStore {
  const inbox: RawMockMessage[] = [
    {
      uid: 108, from: 'notifications@stripe.com', to: 'admin@shailog.tech',
      subject: 'Your payout of $1,240.00 has been scheduled',
      date: minsAgo(18), seen: false, flagged: false,
      snippet: 'The payout is expected to arrive in your bank account on Friday.',
      html: '<p>Hello Shailog Tech,</p><p>Your payout of <strong>$1,240.00</strong> is scheduled and expected in your account on Friday. It covers 14 charges from the last 7 days.</p><p>— The Stripe team</p>',
      text: 'Hello Shailog Tech,\n\nYour payout of $1,240.00 is scheduled and expected in your account on Friday. It covers 14 charges from the last 7 days.\n\n— The Stripe team',
    },
    {
      uid: 107, from: 'priya@indiefounders.in', to: 'admin@shailog.tech', message_id: null,
      subject: 'Invoice for November — design retainer',
      date: minsAgo(95), seen: true, flagged: false,
      snippet: 'Attaching this month\'s invoice for the landing page retainer. Same PO number as…',
      html: null,
      text: "Hi Devesh,\n\nAttaching this month's invoice for the landing page retainer. Same PO number as last month.\n\nCould you confirm receipt?\n\nPriya",
    },
    {
      uid: 106, from: 'mailer-daemon@outlook.com', to: 'admin@shailog.tech',
      subject: 'Undelivered Mail Returned to Sender',
      date: minsAgo(160), seen: false, flagged: false,
      snippet: 'This message was created automatically by mail delivery software…',
      html: null,
      text: 'This message was created automatically by mail delivery software.\n\nThe following address failed permanently: kiran@oldstartup.io (user unknown).',
    },
    {
      uid: 105, from: 'sam@northwind.agency', to: 'admin@shailog.tech',
      subject: 'Re: White-label partnership deck',
      date: minsAgo(3 * 60 + 20), seen: true, flagged: true,
      snippet: 'This looks great. Legal wants one change: swap clause 4b to a 30-day exit…',
      html: '<p>Devesh —</p><p>This looks great. Legal wants one change: swap clause 4b to a 30-day exit window and we can sign this week.</p><p>Can you push v3 with that edit?</p><p>Sam<br>Northwind Agency</p>',
      text: 'Devesh —\n\nThis looks great. Legal wants one change: swap clause 4b to a 30-day exit window and we can sign this week.\n\nCan you push v3 with that edit?\n\nSam\nNorthwind Agency',
    },
    {
      uid: 104, from: 'maria@brightlabs.io', to: 'admin@shailog.tech',
      subject: 'Warmup partnership — intro',
      date: minsAgo(26 * 60), seen: true, flagged: false,
      snippet: 'We run 60 boutique agency accounts and placement is our #1 support ticket…',
      html: '<p>Hi,</p><p>We run 60 boutique agency accounts and placement is our #1 support ticket. Your inbox-placement report is exactly what we hand-build in sheets every Monday.</p><p>Open to a partnership call Thursday?</p><p>— Maria, BrightLabs</p>',
      text: 'Hi,\n\nWe run 60 boutique agency accounts and placement is our #1 support ticket. Your inbox-placement report is exactly what we hand-build in sheets every Monday.\n\nOpen to a partnership call Thursday?\n\n— Maria, BrightLabs',
    },
    {
      uid: 103, from: 'maria@brightlabs.io', to: 'admin@shailog.tech',
      subject: 'Re: Warmup partnership — next steps',
      date: minsAgo(28 * 60 + 5), seen: false, flagged: false,
      snippet: 'Thursday 4pm IST works. Sending a calendar hold now — agenda: placement API…',
      html: '<p>Thursday 4pm IST works. Sending a calendar hold now — agenda: placement API access, co-branded reports, rev-share numbers.</p><p>— Maria</p>',
      text: 'Thursday 4pm IST works. Sending a calendar hold now — agenda: placement API access, co-branded reports, rev-share numbers.\n\n— Maria',
    },
    {
      uid: 102, from: 'team@warmpulse.app', to: 'admin@shailog.tech',
      subject: 'Weekly warmup digest — 41 mailboxes',
      date: minsAgo(50 * 60), seen: true, flagged: false,
      snippet: 'Network warmth 82 (+3). Two mailboxes dipped below 60 — check the alerts…',
      html: '<p>Network warmth <strong>82</strong> (+3 this week).</p><p>Two mailboxes dipped below 60 — check the alerts tab for the affected domains.</p>',
      text: 'Network warmth 82 (+3 this week).\n\nTwo mailboxes dipped below 60 — check the alerts tab for the affected domains.',
    },
    {
      uid: 101, from: 'hello@indiesaa.studio', to: 'admin@shailog.tech',
      subject: 'Loved your cold email (really)',
      date: minsAgo(74 * 60), seen: true, flagged: false,
      snippet: 'Not buying today, but the audit-first angle is the best pitch I\'ve gotten…',
      html: null,
      text: "Not buying today, but the audit-first angle is the best pitch I've gotten this quarter. Ping me in Q1.",
    },
  ];
  const sent: RawMockMessage[] = [
    {
      uid: 93, from: 'admin@shailog.tech', to: 'maria@brightlabs.io',
      subject: 'Re: Warmup partnership — intro',
      date: minsAgo(27 * 60), seen: true, flagged: false,
      snippet: 'Thursday works. Agenda: placement API, co-branded reports, rev-share.',
      html: '<p>Thursday works. Agenda: placement API, co-branded reports, rev-share.</p>',
      text: 'Thursday works. Agenda: placement API, co-branded reports, rev-share.',
    },
    {
      uid: 92, from: 'admin@shailog.tech', to: 'sam@northwind.agency',
      subject: 'White-label partnership deck',
      date: minsAgo(3 * 24 * 60), seen: true, flagged: false,
      snippet: 'Deck attached — v2 with the exit-clause options you asked for.',
      html: '<p>Deck attached — v2 with the exit-clause options you asked for.</p>',
      text: 'Deck attached — v2 with the exit-clause options you asked for.',
    },
    {
      uid: 91, from: 'admin@shailog.tech', to: 'priya@indiefounders.in',
      subject: 'Retainer scope for December',
      date: minsAgo(5 * 24 * 60), seen: true, flagged: false,
      snippet: 'Two landing pages + the warmup onboarding flow, same rate.',
      html: null,
      text: 'Two landing pages + the warmup onboarding flow, same rate.',
    },
  ];
  const drafts: RawMockMessage[] = [
    {
      uid: 90, from: 'admin@shailog.tech', to: 'kiran@newstartup.io',
      subject: 'Your site audit — 3 quick fixes',
      date: minsAgo(40), seen: true, flagged: false,
      snippet: 'Ran your site through our audit — the mobile menu fails on iOS and…',
      html: null,
      text: 'Ran your site through our audit — the mobile menu fails on iOS and the hero takes 6s on 4G. Three fixes attached; want the full report?',
    },
  ];
  const junk: RawMockMessage[] = [
    {
      uid: 89, from: 'winner@lottery-intl.biz', to: 'admin@shailog.tech',
      subject: 'CLAIM YOUR PRIZE NOW',
      date: minsAgo(9 * 60), seen: true, flagged: false,
      snippet: 'Congratulations!!! You have been selected…',
      html: null,
      text: 'Congratulations!!! You have been selected.',
    },
    {
      uid: 88, from: 'seo-guru@cheaprank.net', to: 'admin@shailog.tech',
      subject: '#1 on Google in 7 days',
      date: minsAgo(20 * 60), seen: false, flagged: false,
      snippet: 'Guaranteed first page or money back…',
      html: null,
      text: 'Guaranteed first page or money back.',
    },
  ];
  const trash: RawMockMessage[] = [
    {
      uid: 87, from: 'noreply@oldsaas.io', to: 'admin@shailog.tech',
      subject: 'Your trial has ended',
      date: minsAgo(6 * 24 * 60), seen: true, flagged: false,
      snippet: 'Upgrade to keep your projects…',
      html: null,
      text: 'Upgrade to keep your projects.',
    },
  ];
  return {
    1: { INBOX: wire(inbox), Sent: wire(sent), Drafts: wire(drafts), Junk: wire(junk), Trash: wire(trash) },
    2: {
      INBOX: wire([inbox[2], inbox[6]].map((m, i) => ({
        ...m, uid: 200 + i, to: 'devesh@shailog.tech', flagged: false, seen: i === 0 ? false : true,
      }))),
      Sent: [], Drafts: [], Junk: [], Trash: [],
    },
    // account 3 stays empty — its folder/message calls fail (degraded chip)
  };
}

let mockStore: MockStore | null = null;
const store = (): MockStore => (mockStore ??= buildMockStore());

/** Account 3 simulates an unreachable IMAP server for the degrade states. */
function mockGuard(accountId: number): void {
  if (accountId === 3) throw new Error('IMAP login failed for hello@warmpulse.app — check the mailbox password in Settings.');
}

function mockAccounts(): WebmailAccount[] {
  const st = store();
  const unread = (id: number): number =>
    (st[id]?.INBOX ?? []).filter((m) => !m.seen).length;
  return [
    { id: 1, email: 'admin@shailog.tech', provider: 'imap', is_primary: true, unread: unread(1) },
    { id: 2, email: 'devesh@shailog.tech', provider: 'gmail', is_primary: false, unread: unread(2) },
    {
      id: 3, email: 'hello@warmpulse.app', provider: 'outlook', is_primary: false,
      unread: null, unreachable: true,
      error: 'IMAP login failed — check the mailbox password in Settings.',
    },
  ];
}

function mockFolders(accountId: number): WebmailFolder[] {
  mockGuard(accountId);
  return WEBMAIL_FOLDERS.map((name) => {
    const msgs = store()[accountId]?.[name] ?? [];
    return { name, count: msgs.length, unread: msgs.filter((m) => !m.seen).length };
  });
}

function mockMessages(
  accountId: number,
  folder: WebmailFolderName,
  page: number,
  query: string,
): WebmailMessageList {
  mockGuard(accountId);
  const all = (store()[accountId]?.[folder] ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const q = query.trim().toLowerCase();
  const hits = q
    ? all.filter((m) =>
        [m.from, ...m.to, m.subject, m.snippet].some((f) => f.toLowerCase().includes(q)),
      )
    : all;
  return {
    items: hits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ snippet, flagged, seen, uid, from, subject, date }) => ({
      uid, from, subject, date, seen, flagged, snippet,
    })),
    total: hits.length,
    page,
  };
}

function mockDetail(accountId: number, folder: WebmailFolderName, uid: number): WebmailMessageDetail {
  mockGuard(accountId);
  const msg = (store()[accountId]?.[folder] ?? []).find((m) => m.uid === uid);
  if (!msg) throw new Error('That message is no longer in this folder.');
  return {
    uid: msg.uid, from: msg.from, to: msg.to, subject: msg.subject,
    date: msg.date, html: msg.html, text: msg.text, seen: msg.seen,
    message_id: msg.message_id,
  };
}

function mockSend(accountId: number, input: WebmailSendInput): Result<unknown> {
  const st = store();
  const sent = (st[accountId] ??= {}).Sent ??= [];
  sent.push({
    uid: Date.now() % 100000,
    from: mockAccounts().find((a) => a.id === accountId)?.email ?? 'me',
    to: [input.to], subject: input.subject, date: new Date().toISOString(),
    seen: true, flagged: false, message_id: null,
    snippet: input.body_html.replace(/<[^>]+>/g, ' ').slice(0, 90),
    html: input.body_html,
    text: input.body_html.replace(/<[^>]+>/g, ' '),
  });
  return { ok: true, data: null };
}

function mockMark(
  accountId: number,
  folder: WebmailFolderName,
  uids: number[],
  action: WebmailMarkAction,
): Result<WebmailMarkResult> {
  mockGuard(accountId);
  const st = store();
  const box = st[accountId]?.[folder];
  if (!box) return { ok: true, data: { ok: 0, failed: 0, expunged: 0 } };
  let okCount = 0;
  let expunged = 0;
  let failed = 0;
  for (const uid of uids) {
    const i = box.findIndex((m) => m.uid === uid);
    if (i === -1) {
      failed += 1;
      continue;
    }
    if (action === 'seen' || action === 'unread') box[i].seen = action === 'seen';
    else if (action === 'flagged') box[i].flagged = !box[i].flagged;
    else if (action === 'trash') {
      const [msg] = box.splice(i, 1);
      ((st[accountId] ??= {}).Trash ??= []).push({ ...msg, seen: true });
      expunged += 1;
    }
    okCount += 1;
  }
  return { ok: true, data: { ok: okCount, failed, expunged } };
}
