/**
 * Shared domain types — mirror the handwritten architecture exactly.
 *
 * Agent keys map 1:1 to the pipeline:
 *   Orchestrator -> Search (Scrape) -> Profile -> Copywright -> Responder (Chatbot)
 */

export type AgentKey = 'search' | 'profile' | 'copywright' | 'responder';

/** Wire ids are integers; bundled demo data uses string ids ('lead-1'). */
export type Id = string | number;

/** Top-level pages — Home · Approvals · Leads · Activity · Assistant · Settings. */
export type PageKey = 'home' | 'approvals' | 'replies' | 'tasks' | 'leads' | 'activity' | 'assistant' | 'settings';

/** Tabs inside the Leads page. */
export type LeadsTab = 'all' | 'board' | 'reports';

/** Sections of the Settings page (left-hand section list). */
export type SettingsSection =
  | 'followups'
  | 'whatsapp'
  | 'business'
  | 'targeting'
  | 'email'
  | 'templates'
  | 'mailboxes'
  | 'schedule'
  | 'account'
  | 'billing'
  | 'advanced';

export interface AgentMeta {
  key: AgentKey;
  /** Exact conceptual names from the notes, e.g. "Search (Scrape)". */
  name: string;
  shortName: string;
  /** What this agent represents in the pipeline. */
  role: string;
  status: string; // 'Ready' · 'Running' · 'Paused' (live) / 'Active' (demo)
  lastAction: string;
}

/** One website-audit finding produced by the Profile agent. */
export interface Finding {
  area: string; // Performance · SEO · Mobile · Content · Contact · Trust · Security · Web presence
  severity: 'high' | 'medium' | 'low';
  issue: string;
  recommendation: string;
}

/** CRM — LEADS: companies/leads discovered by the Search agent. */
export interface Lead {
  id: Id;
  company: string;
  industry: string;
  website: string;
  score: number; // 0–100 potential — more fixable flaws → higher score
  source: string; // how Search discovered it
  discovered: string; // relative time
  discoveredAt?: string; // ISO timestamp — for sorting
  profiled?: boolean; // false = Research hasn't checked the site yet
  state: string; // e.g. 'Tamil Nadu' — derived from the discovery query
  country: string; // e.g. 'India' — derived from the discovery query / TLD
  hasWebsite: boolean; // website / no-website categorization
  contactEmail: string; // scraped from their site ('' when none found)
  contactPhone?: string; // scraped from their site (missing when none found)
  findings: Finding[]; // website flaws + improvement recommendations
  description: string; // AI (Gemini) summary of what the company does — read from its site
}

/** CRM — OUTREACH: cold email drafted by Copywright, approved + sent by the user. */
export interface EmailDraft {
  id: Id;
  leadId?: number | null;
  company: string;
  toEmail: string;
  subject: string;
  body: string;
  findings: Finding[];
  status: 'Draft' | 'Approved' | 'Queued' | 'Sent' | 'Rejected' | 'Failed';
  sentVia: string; // 'smtp' | 'console' | ''
  error: string;
  lastActivity: string;
  sentAt?: string | null;
  /** Queued: when the outbox plans to send it (ISO). */
  scheduledFor?: string | null;
  /** Address of the mailbox it goes out from ('' = none yet / console). */
  mailbox?: string;
  /** 'cold' first email, 'followup' sequence step, 'answer' reply to a prospect. */
  kind?: 'cold' | 'followup' | 'answer';
  /** Follow-up step number (0 = the cold email). */
  sequenceStep?: number;
}

/** One DNS check line (SPF / DKIM / DMARC / MX) with a plain-language fix. */
export interface DnsCheckItem {
  ok: boolean;
  hint: string;
  record?: string;
  policy?: string;
  selectors?: string[];
  hosts?: string[];
}

export interface MailboxDns {
  domain?: string;
  error?: string;
  spf?: DnsCheckItem;
  dkim?: DnsCheckItem;
  dmarc?: DnsCheckItem;
  mx?: DnsCheckItem;
}

/** Sending mailbox — GET/POST /api/mailboxes/ (password masked on read). */
export interface Mailbox {
  id: number;
  label: string;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  imapHost: string;
  imapPort: number | null;
  /** Separate login for reading replies (blank = same as sending). */
  imapUser?: string;
  imapPassword?: string;
  /** Last time replies were read from this mailbox, and any problem. */
  imapCheckedAt?: string | null;
  imapError?: string;
  dailyCap: number;
  rampStart: string | null;
  isActive: boolean;
  configured: boolean;
  paused: boolean;
  pausedUntil: string | null;
  pausedReason: string;
  effectiveCap: number;
  sentToday: number;
  queued: number;
  dns: MailboxDns;
  dnsCheckedAt: string | null;
  warmupStatus: string;
  healthScore: number | null;
  warmpulseSyncedAt: string | null;
  stillWarming: boolean;
}

export type MailboxInput = Partial<Pick<Mailbox,
  'label' | 'fromEmail' | 'fromName' | 'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPassword' |
  'imapHost' | 'imapPort' | 'dailyCap' | 'rampStart' | 'isActive'>>;

/** Outbox sending window (Asia/Kolkata hours). */
export interface OutboxConfig {
  windowStart: number;
  windowEnd: number;
  weekdaysOnly: boolean;
}

/** WarmPulse warmup-service link (key masked on read). */
export interface WarmPulseConfig {
  apiUrl: string;
  apiKey: string;
  syncedAt?: string | null;
}

/** SETTINGS — user cold-email template (written manually or uploaded).
 *  Placeholders like {{company}} are filled per lead; with an AI key set,
 *  Gemini personalizes the whole template per lead. */
export interface EmailTemplate {
  id: Id;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
}

/** CRM — POTENTIAL: opportunities identified by the system. */
export interface Potential {
  id: Id;
  company: string;
  opportunity: string;
  value: string;
  stage: 'Discovery' | 'Qualified' | 'Proposal' | 'Negotiation';
  owner: string; // which agent is driving it
}

export type ReplyClassification =
  | 'interested'
  | 'not_now'
  | 'not_interested'
  | 'unsubscribe'
  | 'out_of_office'
  | 'question'
  | 'other'
  | '';

/** The approved answer to a reply, as it moves through the outbox. */
export interface ReplyAnswer {
  id: Id;
  status: EmailDraft['status'];
  scheduledFor: string | null;
  sentAt: string | null;
  sentVia: string;
  error: string;
}

/** A prospect's answer to our email, read from the mailbox (core.inbox). */
export interface Reply {
  id: Id;
  company: string;
  contact: string;
  channel: 'Email' | 'LinkedIn' | 'Webchat';
  status: 'Replied' | 'Awaiting' | 'Meeting booked';
  summary: string;
  lastActivity: string;
  fromEmail: string;
  subject: string;
  /** Their new text, quoted history removed. */
  bodyText: string;
  receivedAt: string | null;
  classification: ReplyClassification;
  /** Plain-language label, e.g. "Interested", "Asked to stop". */
  classificationLabel: string;
  confidence: number | null;
  /** Answer the Responder suggests — sent only after you approve it. */
  suggestedReply: string;
  handled: boolean;
  needsAttention: boolean;
  draftId: Id | null;
  leadId: Id | null;
  originalSubject: string;
  answer: ReplyAnswer | null;
}

/** AGENTS page — per-agent configuration (API / SYSTEM PROMPTS / NEGATIVE / MODEL).
 *  The DB is always MongoDB — fixed by the backend, nothing to set in the UI. */
export interface AgentConfig {
  db: {
    provider: 'mongodb';
    name?: string;
    connection?: string;
  };
  api: {
    url: string;
    auth: string;
  };
  systemPrompt: string;
  negativePrompt: string;
  model: string;
}

/** SETTINGS page. */
export interface CompanyProfile {
  name: string;
  website: string;
  description: string;
  services: string[];
  /** Postal address printed in every cold-email footer (anti-spam law). */
  address: string;
}

export interface AiKeyConfig {
  provider: string;
  apiKey: string;
  apolloApiKey?: string; // Apollo.io — lead phone/company enrichment (masked on read)
  scalelistApiKey?: string; // Scalelist phone lookup (masked on read) — each company brings its own
  apifyApiKey?: string; // Apify Google Maps actor (masked on read)
}

export interface SmtpConfig {
  host: string;
  port: string | number;
  user: string;
  password: string; // masked '••••1234' on read — write only when changed
  from: string;
}

export type RunFrequency = '15m' | '1h' | '6h' | 'daily';

export interface FrequentRuns {
  enabled: boolean;
  frequency: RunFrequency;
}

/** Daily report — admin email(s) the 8 PM IST report is sent to. */
export interface ReportConfig {
  email: string; // comma-separated allowed
}

export interface SettingsState {
  company: CompanyProfile;
  aiKey: AiKeyConfig;
  smtp: SmtpConfig;
  runs: FrequentRuns;
  report: ReportConfig;
  targeting: TargetingState;
  outbox: OutboxConfig;
  warmpulse: WarmPulseConfig;
  followups: FollowupsConfig;
  whatsapp: WhatsAppConfig;
}

/** Settings → Follow-ups (core.sequences). */
export interface FollowupsConfig {
  enabled: boolean;
  /** Email follow-ups only — WhatsApp always needs an approval. */
  autoApprove: boolean;
}

/** Settings → WhatsApp (opt-in open-wa sidecar, core.whatsapp). */
export interface WhatsAppConfig {
  enabled: boolean;
  sidecarUrl: string;
  secret: string; // masked on read — write only when changed
  dailyCap: number;
}

export type SequenceChannel = 'email' | 'whatsapp' | 'linkedin_task' | 'call_task';

export interface SequenceStep {
  id?: number;
  order: number;
  channel: SequenceChannel;
  delayDays: number;
  businessDays: boolean;
  subject: string;
  body: string;
  personalize: boolean;
  enabled: boolean;
}

export interface Sequence {
  id: number;
  name: string;
  isDefault: boolean;
  active: boolean;
  steps: SequenceStep[];
}

export interface Enrollment {
  id: number;
  leadId: number;
  company: string;
  sequence: string;
  status: 'active' | 'paused' | 'completed' | 'stopped';
  currentStep: number;
  pendingStep: number | null;
  totalSteps: number;
  stopReason: string;
  nextDueAt: string | null;
  startedAt: string;
}

export interface OutreachTask {
  id: number;
  leadId: number | null;
  company: string;
  channel: 'linkedin' | 'call' | 'whatsapp';
  message: string;
  url: string;
  phone: string;
  dueAt: string | null;
  status: 'open' | 'done' | 'skipped';
}

export interface WhatsAppMessage {
  id: number;
  leadId: number | null;
  company: string;
  toPhone: string;
  text: string;
  status: 'draft' | 'queued' | 'sending' | 'sent' | 'rejected' | 'failed';
  scheduledFor: string | null;
  sentAt: string | null;
  error: string;
  waMeLink: string;
}

export interface WhatsAppStatus {
  enabled: boolean;
  reachable: boolean;
  connected: boolean;
  state: string;
  error: string;
  sentToday: number;
  dailyCap: number;
}

/** Who the ICP engine hunts: buyers of our services, or peer agencies as
 *  project partners (agency terms searchable, competitor filter off). */
export type IcpMode = 'buyer' | 'agency';

export interface TargetingState {
  countries: string[];
  industries: string[];
  cities: string[]; // cities win over countries; [] industries = ICP auto-targeting
  icpMode: IcpMode;
}

/** Saved lead-targeting preset — one click on Activate copies it into the
 *  live settings (takes effect on the next pipeline cycle). */
export interface SearchProfile {
  id: number;
  name: string;
  description: string;
  countries: string[];
  industries: string[];
  cities: string[];
  icpMode: IcpMode;
  isActive: boolean;
}

/** CHAT page. */
export interface ChatMessage {
  id: number;
  from: 'user' | 'ai';
  text: string;
  time: string;
}

/** First-login setup wizard state — drives the chat onboarding UI. */
export interface OnboardingState {
  needed: boolean;
  done: boolean;
  stepIndex: number;
  stepCount: number;
  stepKey: string;
  question: string;
  hint: string;
  progress: string;
}

/** Live loop state — GET /api/pipeline/status/. */
export interface PipelineStatus {
  autopilot: boolean; // Settings → Schedule: automatic runs on/off
  frequency: RunFrequency;
  cycleRunning: boolean; // a cycle is executing right now (API, chat or worker)
  cycleStartedAt: string | null;
  workerOnline: boolean; // background worker heartbeat is fresh
  nextRunInMinutes: number | null;
  lastRun: {
    id: number;
    at: string | null;
    finishedAt: string | null;
    leadsCreated: number;
    potentialsCreated: number;
    draftsCreated: number;
    summary: { notes?: string[]; query?: string };
  } | null;
}

/** Outreach counters — GET /api/outreach/status/. */
export interface OutreachStatus {
  drafts: number;
  approved: number;
  sent: number;
  failed: number;
  /** Approved and waiting in the outbox. */
  queued?: number;
  nextSendAt?: string | null;
  inSendingWindow?: boolean;
  mailboxes?: OutreachMailbox[];
  smtpConfigured: boolean;
  /** Prospect replies waiting on you (not handled, not auto-replies). */
  repliesNeedingAttention?: number;
  repliesTotal?: number;
}

export interface OutreachMailbox {
  id: number;
  fromEmail: string;
  label: string;
  sentToday: number;
  cap: number;
  dailyCap: number;
  paused: boolean;
  isActive: boolean;
}

/** One past cycle — GET /api/pipeline/runs/. */
export interface PipelineRunRecord {
  id: number;
  startedAt: string;
  finishedAt: string;
  triggeredBy: string;
  leadsCreated: number;
  potentialsCreated: number;
  draftsCreated: number;
  notes: string[];
}
