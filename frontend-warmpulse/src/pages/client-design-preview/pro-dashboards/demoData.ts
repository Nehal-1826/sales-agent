/**
 * Demo data for the Pro Dashboard design picker.
 *
 * Pro has up to 5 mailboxes. None of the 6 design variants can be judged
 * on aesthetics alone — they need to show how they handle multi-mailbox
 * density. This module gives every variant the SAME shape of data so the
 * comparison is apples-to-apples.
 *
 * The real Pro Dashboard (post-pick) will swap these for live hooks.
 */

export type DemoStatus = 'active' | 'paused' | 'warmup';
export type DemoProvider = 'gmail' | 'outlook' | 'yahoo';

export interface DemoMailbox {
  id: string;
  email: string;
  provider: DemoProvider;
  warmth: number;        // 0-100
  day: number;           // day in ramp
  sentToday: number;
  dailyTarget: number;
  status: DemoStatus;
  spfOk: boolean;
  dkimOk: boolean;
  dmarcOk: boolean;
  /** 14-day trailing warmth scores, oldest → newest. */
  spark: number[];
}

export const DEMO_MAILBOXES: DemoMailbox[] = [
  {
    id: 'mb-1',
    email: 'alex@acme.com',
    provider: 'gmail',
    warmth: 87,
    day: 14,
    sentToday: 28,
    dailyTarget: 50,
    status: 'active',
    spfOk: true, dkimOk: true, dmarcOk: true,
    spark: [60, 62, 65, 68, 70, 72, 75, 76, 78, 80, 82, 84, 86, 87],
  },
  {
    id: 'mb-2',
    email: 'bryan@acme.com',
    provider: 'gmail',
    warmth: 72,
    day: 9,
    sentToday: 15,
    dailyTarget: 20,
    status: 'active',
    spfOk: true, dkimOk: true, dmarcOk: false,
    spark: [40, 42, 45, 48, 52, 55, 58, 61, 63, 65, 67, 68, 70, 72],
  },
  {
    id: 'mb-3',
    email: 'casey@acme.com',
    provider: 'outlook',
    warmth: 91,
    day: 22,
    sentToday: 35,
    dailyTarget: 50,
    status: 'active',
    spfOk: true, dkimOk: true, dmarcOk: true,
    spark: [70, 73, 75, 78, 80, 82, 84, 85, 87, 88, 89, 90, 90, 91],
  },
  {
    id: 'mb-4',
    email: 'dana@acme.com',
    provider: 'gmail',
    warmth: 64,
    day: 6,
    sentToday: 0,
    dailyTarget: 10,
    status: 'paused',
    spfOk: true, dkimOk: false, dmarcOk: false,
    spark: [30, 35, 38, 42, 46, 50, 53, 56, 58, 60, 62, 63, 64, 64],
  },
  {
    id: 'mb-5',
    email: 'eli@acme.com',
    provider: 'yahoo',
    warmth: 58,
    day: 4,
    sentToday: 8,
    dailyTarget: 5,
    status: 'warmup',
    spfOk: true, dkimOk: true, dmarcOk: true,
    spark: [20, 24, 28, 32, 36, 40, 44, 47, 50, 52, 54, 56, 57, 58],
  },
];

/** Aggregate stats across all demo mailboxes. */
export const DEMO_AGGREGATE = {
  avgWarmth: Math.round(
    DEMO_MAILBOXES.reduce((s, m) => s + m.warmth, 0) / DEMO_MAILBOXES.length,
  ),
  totalSentToday: DEMO_MAILBOXES.reduce((s, m) => s + m.sentToday, 0),
  totalTarget: DEMO_MAILBOXES.reduce((s, m) => s + m.dailyTarget, 0),
  activeCount: DEMO_MAILBOXES.filter((m) => m.status === 'active').length,
  pausedCount: DEMO_MAILBOXES.filter((m) => m.status === 'paused').length,
  warmupCount: DEMO_MAILBOXES.filter((m) => m.status === 'warmup').length,
  opensToday: 142,
  repliesToday: 38,
  spamRescuedToday: 6,
  bouncesToday: 2,
};

/** 30-day aggregate sends timeline. Oldest → newest. */
export const DEMO_SENDS_30D: number[] = [
  12, 15, 14, 18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 42, 45, 48, 50, 52, 55,
  58, 62, 65, 68, 72, 75, 78, 82, 85, 88, 86,
];

/** Recent activity events for the live feed. */
export interface DemoEvent {
  id: string;
  ts: string;
  mailbox: string;
  action: 'sent' | 'opened' | 'replied' | 'starred' | 'spam_rescued';
  peer: string;
  subject?: string;
}

export const DEMO_EVENTS: DemoEvent[] = [
  { id: 'e1',  ts: relMin(2),   mailbox: 'alex@acme.com',  action: 'replied',      peer: 'sara@northwind.com',  subject: 'Re: Q3 pipeline review' },
  { id: 'e2',  ts: relMin(4),   mailbox: 'casey@acme.com', action: 'opened',       peer: 'lin@orbit.dev',       subject: 'Touching base · April' },
  { id: 'e3',  ts: relMin(6),   mailbox: 'alex@acme.com',  action: 'sent',         peer: 'priya@lumen.co',      subject: 'Following up on demo' },
  { id: 'e4',  ts: relMin(8),   mailbox: 'eli@acme.com',   action: 'sent',         peer: 'theo@deltahq.io',     subject: 'Quick intro' },
  { id: 'e5',  ts: relMin(10),  mailbox: 'bryan@acme.com', action: 'starred',      peer: 'maya@helix.co',       subject: 'Re: scheduling' },
  { id: 'e6',  ts: relMin(13),  mailbox: 'casey@acme.com', action: 'replied',      peer: 'omar@cipher.ai',      subject: 'Re: pricing question' },
  { id: 'e7',  ts: relMin(16),  mailbox: 'alex@acme.com',  action: 'opened',       peer: 'jin@stratus.io',      subject: 'About your warmup setup' },
  { id: 'e8',  ts: relMin(19),  mailbox: 'casey@acme.com', action: 'spam_rescued', peer: 'noah@vault.dev',      subject: 'Q3 plan' },
  { id: 'e9',  ts: relMin(22),  mailbox: 'bryan@acme.com', action: 'opened',       peer: 'irene@flux.co',       subject: 'Re: API access' },
  { id: 'e10', ts: relMin(25),  mailbox: 'alex@acme.com',  action: 'sent',         peer: 'rahul@vector.io',     subject: 'Catching up after Reinvent' },
  { id: 'e11', ts: relMin(28),  mailbox: 'eli@acme.com',   action: 'opened',       peer: 'sasha@ember.com',     subject: 'Welcome to the network' },
  { id: 'e12', ts: relMin(33),  mailbox: 'casey@acme.com', action: 'sent',         peer: 'lee@photon.dev',      subject: 'Office hours this Thursday' },
  { id: 'e13', ts: relMin(37),  mailbox: 'alex@acme.com',  action: 'replied',      peer: 'aria@halo.co',        subject: 'Re: ICP feedback' },
  { id: 'e14', ts: relMin(41),  mailbox: 'bryan@acme.com', action: 'sent',         peer: 'kira@spectra.ai',     subject: 'Quick question on integrations' },
  { id: 'e15', ts: relMin(46),  mailbox: 'casey@acme.com', action: 'opened',       peer: 'amir@signal.dev',     subject: 'Re: deck review' },
  { id: 'e16', ts: relMin(52),  mailbox: 'eli@acme.com',   action: 'starred',      peer: 'tom@bridge.io',       subject: 'Welcome aboard' },
  { id: 'e17', ts: relMin(58),  mailbox: 'alex@acme.com',  action: 'opened',       peer: 'eve@cascade.co',      subject: 'Re: warmth report' },
  { id: 'e18', ts: relMin(64),  mailbox: 'casey@acme.com', action: 'sent',         peer: 'ben@arclight.dev',    subject: 'Following up · April demo' },
  { id: 'e19', ts: relMin(71),  mailbox: 'bryan@acme.com', action: 'replied',      peer: 'ross@meridian.io',    subject: 'Re: pilot terms' },
  { id: 'e20', ts: relMin(78),  mailbox: 'alex@acme.com',  action: 'sent',         peer: 'yuki@nimbus.dev',     subject: 'Sharing our roadmap' },
  { id: 'e21', ts: relMin(85),  mailbox: 'casey@acme.com', action: 'replied',      peer: 'omar@cipher.ai',      subject: 'Re: Re: pricing question' },
  { id: 'e22', ts: relMin(94),  mailbox: 'eli@acme.com',   action: 'sent',         peer: 'gabe@kinetic.com',    subject: 'Touching base' },
  { id: 'e23', ts: relMin(103), mailbox: 'alex@acme.com',  action: 'spam_rescued', peer: 'hugo@parallax.dev',   subject: 'Quick chat?' },
  { id: 'e24', ts: relMin(112), mailbox: 'bryan@acme.com', action: 'opened',       peer: 'naia@drift.ai',       subject: 'Re: onboarding plan' },
  { id: 'e25', ts: relMin(126), mailbox: 'casey@acme.com', action: 'sent',         peer: 'kai@torrent.io',      subject: 'Aligning on Q3 OKRs' },
  { id: 'e26', ts: relMin(140), mailbox: 'alex@acme.com',  action: 'opened',       peer: 'finn@axis.dev',       subject: 'Re: deck v2' },
  { id: 'e27', ts: relMin(158), mailbox: 'eli@acme.com',   action: 'replied',      peer: 'lior@beacon.co',      subject: 'Re: intro from Marcus' },
  { id: 'e28', ts: relMin(176), mailbox: 'casey@acme.com', action: 'starred',      peer: 'omar@cipher.ai',      subject: 'Re: contract' },
  { id: 'e29', ts: relMin(195), mailbox: 'bryan@acme.com', action: 'sent',         peer: 'pia@orbit.dev',       subject: 'Reviving an old thread' },
  { id: 'e30', ts: relMin(218), mailbox: 'alex@acme.com',  action: 'sent',         peer: 'val@kingfisher.com',  subject: 'Quick intro' },
];

function relMin(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

/** Team members for variants that surface team activity. */
export const DEMO_TEAM = [
  { name: 'Alex Chen', role: 'Owner', mailbox: 'alex@acme.com', avatar: 'AC' },
  { name: 'Bryan Lee', role: 'SDR', mailbox: 'bryan@acme.com', avatar: 'BL' },
  { name: 'Casey Park', role: 'SDR Lead', mailbox: 'casey@acme.com', avatar: 'CP' },
  { name: 'Dana Reyes', role: 'BDR', mailbox: 'dana@acme.com', avatar: 'DR' },
  { name: 'Eli Singh', role: 'BDR', mailbox: 'eli@acme.com', avatar: 'ES' },
];

export function formatRelTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function providerLabel(p: DemoProvider): string {
  if (p === 'gmail') return 'Gmail';
  if (p === 'outlook') return 'Outlook';
  return 'Yahoo';
}
