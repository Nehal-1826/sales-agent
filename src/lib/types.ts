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
export type PageKey = 'home' | 'approvals' | 'leads' | 'activity' | 'assistant' | 'settings';

/** Tabs inside the Leads page. */
export type LeadsTab = 'all' | 'board' | 'reports';

/** Sections of the Settings page (left-hand section list). */
export type SettingsSection =
  | 'business'
  | 'targeting'
  | 'email'
  | 'templates'
  | 'schedule'
  | 'account'
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
  status: 'Draft' | 'Approved' | 'Sent' | 'Rejected' | 'Failed';
  sentVia: string; // 'smtp' | 'console' | ''
  error: string;
  lastActivity: string;
  sentAt?: string | null;
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

/** CRM — REPLY: responses handled by the Responder (Chatbot). */
export interface Reply {
  id: Id;
  company: string;
  contact: string;
  channel: 'Email' | 'LinkedIn' | 'Webchat';
  status: 'Replied' | 'Awaiting' | 'Meeting booked';
  summary: string;
  lastActivity: string;
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
}

export interface AiKeyConfig {
  provider: string;
  apiKey: string;
  apolloApiKey?: string; // Apollo.io — lead phone/company enrichment (masked on read)
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
  smtpConfigured: boolean;
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
