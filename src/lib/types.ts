/**
 * Shared domain types — mirror the handwritten architecture exactly.
 *
 * Agent keys map 1:1 to the pipeline:
 *   Orchestrator -> Search (Scrape) -> Profile -> Copywright -> Responder (Chatbot)
 */

export type AgentKey = 'search' | 'profile' | 'copywright' | 'responder';

/** Top-level menus — Dashboard · Pipeline · Settings.
 *  Agents, CRM, Leads, Reports and Chat live as tabs inside Pipeline. */
export type PageKey = 'dashboard' | 'pipeline' | 'settings';

/** Sub-tabs inside the Pipeline page. */
export type PipelineTab = 'flow' | 'agents' | 'leads' | 'crm' | 'chat';

export interface AgentMeta {
  key: AgentKey;
  /** Exact conceptual names from the notes, e.g. "Search (Scrape)". */
  name: string;
  shortName: string;
  /** What this agent represents in the pipeline. */
  role: string;
  status: 'Active' | 'Idle';
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
  id: string;
  company: string;
  industry: string;
  website: string;
  score: number; // 0–100 potential — more fixable flaws → higher score
  source: string; // how Search discovered it
  discovered: string; // relative time
  state: string; // e.g. 'Tamil Nadu' — derived from the discovery query
  country: string; // e.g. 'India' — derived from the discovery query / TLD
  hasWebsite: boolean; // website / no-website categorization
  contactEmail: string; // scraped from their site ('' when none found)
  findings: Finding[]; // website flaws + improvement recommendations
  description: string; // AI (Gemini) summary of what the company does — read from its site
}

/** CRM — OUTREACH: cold email drafted by Copywright, approved + sent by the user. */
export interface EmailDraft {
  id: string;
  company: string;
  toEmail: string;
  subject: string;
  body: string;
  findings: Finding[];
  status: 'Draft' | 'Approved' | 'Sent' | 'Rejected' | 'Failed';
  sentVia: string; // 'smtp' | 'console' | ''
  error: string;
  lastActivity: string;
}

/** SETTINGS — user cold-email template (written manually or uploaded).
 *  Placeholders like {{company}} are filled per lead; with an AI key set,
 *  Gemini personalizes the whole template per lead. */
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
}

/** CRM — POTENTIAL: opportunities identified by the system. */
export interface Potential {
  id: string;
  company: string;
  opportunity: string;
  value: string;
  stage: 'Discovery' | 'Qualified' | 'Proposal' | 'Negotiation';
  owner: string; // which agent is driving it
}

/** CRM — REPLY: responses handled by the Responder (Chatbot). */
export interface Reply {
  id: string;
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
  targeting: { countries: string[] }; // [] = worldwide lead discovery sweep
}

/** CHAT page. */
export interface ChatMessage {
  id: number;
  from: 'user' | 'ai';
  text: string;
  time: string;
}
