/**
 * Every API endpoint. Getters throw ApiError when live (callers show an
 * error state); mutations return Result. Demo mode resolves bundled data.
 */

import {
  CHAT_INITIAL,
  DEFAULT_AGENT_CONFIGS,
  DEFAULT_SETTINGS,
  MOCK_DRAFTS,
  MOCK_LEADS,
  MOCK_PROFILES,
  MOCK_TEMPLATES,
  mockResponderReply,
} from './mockData';
import { attempt, downloadFile, inDemo, post, put, request } from './transport';
import type { Result } from './transport';
import type {
  AgentConfig,
  AgentKey,
  ChatMessage,
  EmailDraft,
  EmailTemplate,
  Id,
  Lead,
  OnboardingState,
  OutreachStatus,
  PipelineRunRecord,
  PipelineStatus,
  SearchProfile,
  SettingsState,
} from './types';

const DEMO_ONLY = 'This is the offline demo. Connect your workspace to do that.';
const demoFail = <T>(): Result<T> => ({ ok: false, error: DEMO_ONLY });

/* ---------------- account ---------------- */

export interface CurrentUser {
  name: string;
  role: string;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  if (await inDemo()) return { name: 'Demo', role: 'owner' };
  const me = await request<{ username: string; role: string }>('/auth/me/');
  return { name: me.username, role: me.role };
}

export async function changePassword(current: string, next: string, confirm: string): Promise<Result<unknown>> {
  if (await inDemo()) return demoFail();
  return attempt(() =>
    request('/auth/password/', post({ currentPassword: current, newPassword: next, confirmPassword: confirm })),
  );
}

/* ---------------- workspace status ---------------- */


const DEMO_STATUS: PipelineStatus = {
  autopilot: true,
  frequency: '1h',
  cycleRunning: false,
  cycleStartedAt: null,
  workerOnline: false,
  nextRunInMinutes: 42,
  lastRun: null,
};

export async function getPipelineStatus(): Promise<PipelineStatus> {
  if (await inDemo()) return DEMO_STATUS;
  return request<PipelineStatus>('/pipeline/status/');
}

export async function getOutreachStatus(): Promise<OutreachStatus> {
  if (await inDemo()) {
    const by = (s: EmailDraft['status']) => MOCK_DRAFTS.filter((d) => d.status === s).length;
    return { drafts: by('Draft'), approved: by('Approved'), sent: by('Sent'), failed: by('Failed'), smtpConfigured: false };
  }
  return request<OutreachStatus>('/outreach/status/');
}

/** Start one cycle in the background. 409 (busy) comes back as ok:false. */
export async function runPipeline(): Promise<Result<{ started: boolean }>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<{ started: boolean }>('/pipeline/run/', post()));
}

export async function getPipelineRuns(): Promise<PipelineRunRecord[]> {
  if (await inDemo()) return [];
  const runs = await request<
    {
      id: number;
      started_at: string;
      finished_at: string;
      triggered_by: string;
      leads_created: number;
      potentials_created: number;
      replies_created: number;
      summary: { notes?: string[]; drafts_created?: number };
    }[]
  >('/pipeline/runs/');
  return runs.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    triggeredBy: r.triggered_by,
    leadsCreated: r.leads_created,
    potentialsCreated: r.potentials_created,
    draftsCreated: r.summary?.drafts_created ?? r.replies_created,
    notes: r.summary?.notes ?? [],
  }));
}


/* ---------------- CRM data ---------------- */

export async function getLeads(): Promise<Lead[]> {
  if (await inDemo()) return MOCK_LEADS;
  return request<Lead[]>('/leads/', undefined, 20_000);
}



export async function downloadLeadsCsv(): Promise<Result<true>> {
  if (await inDemo()) return demoFail();
  return downloadFile('/leads/export/', `leads-${new Date().toISOString().slice(0, 10)}.csv`);
}

export interface GeneratedReport {
  subject: string;
  text: string;
  html: string;
  emailed: boolean;
}

export async function generateReport(scope: 'today' | 'all', email = false): Promise<Result<GeneratedReport>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<GeneratedReport>('/report/generate/', post({ scope, email }), 60_000));
}

export async function sendTestReport(): Promise<Result<{ status: 'smtp' | 'console' | 'skipped'; recipients: string[] }>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request('/report/test/', post(), 60_000));
}

/* ---------------- outreach drafts ---------------- */

export async function getDrafts(): Promise<EmailDraft[]> {
  if (await inDemo()) return MOCK_DRAFTS;
  return request<EmailDraft[]>('/drafts/');
}

export async function updateDraft(
  id: Id,
  patch: { subject?: string; body?: string; toEmail?: string },
): Promise<Result<EmailDraft>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<EmailDraft>(`/drafts/${id}/`, put(patch)));
}

/** Approve → the backend sends immediately. SMTP can take ~30 s per message. */
export async function approveDraft(id: Id): Promise<Result<EmailDraft>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<EmailDraft>(`/drafts/${id}/approve/`, post(), 45_000));
}

/** Retry a failed send. */
export async function sendDraft(id: Id): Promise<Result<EmailDraft>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<EmailDraft>(`/drafts/${id}/send/`, post(), 45_000));
}

export async function rejectDraft(id: Id): Promise<Result<EmailDraft>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<EmailDraft>(`/drafts/${id}/reject/`, post()));
}

export interface DraftLeadResult {
  ok: boolean;
  draft?: EmailDraft;
  used_llm?: boolean;
  detail?: string;
}

/** Hand-write a draft for any lead — it lands in Approvals, never sends by itself. */
export async function draftLeadEmail(leadId: Id): Promise<Result<DraftLeadResult>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<DraftLeadResult>(`/leads/${leadId}/draft_email/`, post(), 60_000));
}

/* ---------------- settings ---------------- */

export async function getSettings(): Promise<SettingsState> {
  if (await inDemo()) return DEFAULT_SETTINGS;
  return request<SettingsState>('/settings/');
}

/** Partial save — send only the sections that changed. */
export async function putSettings(patch: Partial<SettingsState>): Promise<Result<SettingsState>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<SettingsState>('/settings/', put(patch)));
}

export interface SmtpConnectResult {
  ok: boolean;
  host?: string;
  port?: number;
  message: string;
}

/** One-click mailbox connect: the server probes the provider with a real
 *  SMTP login and saves the first server that authenticates. */
export async function connectSmtp(payload: {
  provider: string;
  user: string;
  password: string;
  host?: string;
  port?: string | number;
}): Promise<Result<SmtpConnectResult>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<SmtpConnectResult>('/settings/smtp_connect/', post(payload), 60_000));
}

export async function getProfiles(): Promise<SearchProfile[]> {
  if (await inDemo()) return MOCK_PROFILES;
  return request<SearchProfile[]>('/profiles/');
}

export async function createProfile(
  profile: Omit<SearchProfile, 'id' | 'isActive'>,
): Promise<Result<SearchProfile>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<SearchProfile>('/profiles/', post(profile)));
}

export async function activateProfile(id: number): Promise<Result<{ settings: SettingsState }>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<{ settings: SettingsState }>(`/profiles/${id}/activate/`, post()));
}

export async function getTemplates(): Promise<EmailTemplate[]> {
  if (await inDemo()) return MOCK_TEMPLATES;
  return request<EmailTemplate[]>('/templates/');
}

export async function createTemplate(tpl: Omit<EmailTemplate, 'id'>): Promise<Result<EmailTemplate>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<EmailTemplate>('/templates/', post(tpl)));
}

export async function updateTemplate(id: Id, tpl: Partial<EmailTemplate>): Promise<Result<EmailTemplate>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<EmailTemplate>(`/templates/${id}/`, put(tpl)));
}

export async function deleteTemplate(id: Id): Promise<Result<unknown>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request(`/templates/${id}/`, { method: 'DELETE' }));
}

/* ---------------- agents (Settings → Advanced) ---------------- */

export async function getAgentConfig(agent: AgentKey): Promise<AgentConfig> {
  if (await inDemo()) return DEFAULT_AGENT_CONFIGS[agent];
  return request<AgentConfig>(`/agents/${agent}/config/`);
}

export async function putAgentConfig(agent: AgentKey, config: AgentConfig): Promise<Result<AgentConfig>> {
  if (await inDemo()) return demoFail();
  return attempt(() => request<AgentConfig>(`/agents/${agent}/config/`, put(config)));
}

/* ---------------- assistant chat + setup wizard ---------------- */

export interface ChatHistory {
  messages: ChatMessage[];
  onboarding: OnboardingState | null;
  /** confirmation the server still holds (it keeps one for 10 minutes) */
  pendingAction: string | null;
}

export async function getChatHistory(): Promise<ChatHistory> {
  if (await inDemo()) return { messages: CHAT_INITIAL, onboarding: null, pendingAction: null };
  const data = await request<{ messages?: ChatMessage[]; onboarding?: OnboardingState; pendingAction?: string | null }>('/chat/');
  return { messages: data.messages ?? [], onboarding: data.onboarding ?? null, pendingAction: data.pendingAction ?? null };
}

export async function getOnboarding(): Promise<OnboardingState | null> {
  if (await inDemo()) return null;
  return request<OnboardingState>('/onboarding/');
}

export interface ChatTurn {
  reply: ChatMessage;
  onboarding: OnboardingState | null;
  /** Set when the assistant is waiting for "yes"/"no" on a risky action. */
  pendingAction: string | null;
}

export async function sendChatMessage(text: string): Promise<Result<ChatTurn>> {
  if (await inDemo()) {
    const reply: ChatMessage = {
      id: Date.now(),
      from: 'ai',
      text: mockResponderReply(text, text.length),
      time: 'now',
    };
    return { ok: true, data: { reply, onboarding: null, pendingAction: null } };
  }
  return attempt(async () => {
    // actions (sending approved emails, reports) can take a while
    const r = await request<{ reply: ChatMessage; onboarding?: OnboardingState; pendingAction?: string | null }>(
      '/chat/',
      post({ text }),
      90_000,
    );
    return { reply: r.reply, onboarding: r.onboarding ?? null, pendingAction: r.pendingAction ?? null };
  });
}

export async function clearChat(): Promise<Result<unknown>> {
  if (await inDemo()) return { ok: true, data: null };
  return attempt(() => request('/chat/', { method: 'DELETE' }));
}

const DEMO_GUIDE =
  'Quick tour: Activity → "Find leads now" discovers companies. Approvals shows the emails ' +
  'written for you: review, edit, then Approve & send. Settings holds your business details, ' +
  'who to find, email sending and the schedule.';

export async function askGuide(text: string, history: { from: string; text: string }[] = []): Promise<Result<string>> {
  if (await inDemo()) return { ok: true, data: DEMO_GUIDE };
  return attempt(async () => {
    const r = await request<{ answer: string }>('/guide/', post({ text, history: history.slice(-8) }), 90_000);
    return r.answer;
  });
}
