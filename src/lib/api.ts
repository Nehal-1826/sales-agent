/**
 * Backend connection layer — talks to the Django backend when it is running
 * and falls back to the bundled mock data when it is not, so the frontend
 * always works.
 *
 * Backend architecture (implemented in ./backend):
 *   PYTHON → DJANGO → DATA SCHEMA → JSON → DB (POSTGRESQL)
 *          → API ENDPOINTS → CORS → USERS / ROLES
 */

import {
  AGENTS,
  DEFAULT_SETTINGS,
  MOCK_DRAFTS,
  MOCK_LEADS,
  MOCK_POTENTIAL,
  MOCK_REPLIES,
  mockResponderReply,
} from './mockData';
import type {
  AgentConfig,
  AgentKey,
  AgentMeta,
  ChatMessage,
  EmailDraft,
  EmailTemplate,
  Lead,
  Potential,
  Reply,
  RunFrequency,
  SettingsState,
} from './types';

/** Base URL the Django API is served from (Vite proxies /api → 127.0.0.1:8000). */
export const API_BASE_URL: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '/api';

const TOKEN_KEY = 'agentic-ai:token';

let authToken: string | null = null;
try {
  authToken = localStorage.getItem(TOKEN_KEY);
} catch {
  /* storage unavailable */
}

/* ------------------------------------------------------------------ */
/* Backend probe + auth                                                */
/* ------------------------------------------------------------------ */

let backendReady: Promise<boolean> | null = null;

async function fetchJson<T>(path: string, init?: RequestInit, timeoutMs = 5000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers.Authorization = `Token ${authToken}`;
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Auth — real login (no shipped credentials)                         */
/* ------------------------------------------------------------------ */

export async function login(
  username: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // bare fetch: never send a (possibly stale) token on login — DRF would
    // reject the whole request with 401 before credentials are checked
    const res = await fetch(`${API_BASE_URL}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: 'Login failed — check your username and password.' };
    const data = (await res.json()) as { token: string };
    authToken = data.token;
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Login failed — the backend is not reachable.' };
  }
}

export function logout(): void {
  authToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export type AuthState = 'live' | 'mock' | 'unauthenticated';

/**
 * Session gate: 'live' (backend up + valid token), 'unauthenticated'
 * (backend up, login required) or 'mock' (backend down — offline demo).
 */
export async function checkAuth(): Promise<AuthState> {
  const up = await ensureBackend();
  if (!up) return 'mock';
  if (!authToken) return 'unauthenticated';
  try {
    await fetchJson('/auth/me/');
    return 'live';
  } catch {
    return 'unauthenticated';
  }
}

export interface BackendHealth {
  live: boolean;
  authenticated: boolean;
  database?: string;
  user?: { username: string; role: string };
}

/**
 * Probe the Django backend once per session (health only).
 * Every data getter below awaits this, then chooses live data or mock data.
 */
export function ensureBackend(): Promise<boolean> {
  if (!backendReady) {
    backendReady = (async () => {
      try {
        // bare fetch on purpose: a stale auth token must never turn the
        // unauthenticated health probe into a 401 (DRF rejects bad tokens
        // even on AllowAny views)
        const res = await fetch(`${API_BASE_URL}/health/`, {
          signal: AbortSignal.timeout(2500),
        });
        const health = (await res.json()) as { status: string };
        return health.status === 'ok';
      } catch {
        return false;
      }
    })();
  }
  return backendReady;
}

/** Re-probe (e.g. after the user starts the backend). */
export function reprobeBackend(): Promise<boolean> {
  backendReady = null;
  return ensureBackend();
}

export async function getBackendHealth(): Promise<BackendHealth> {
  const live = await ensureBackend();
  if (!live) return { live: false, authenticated: false };
  try {
    const [health, user] = await Promise.all([
      fetchJson<{ database: string }>('/health/'),
      fetchJson<{ username: string; role: string }>('/auth/me/'),
    ]);
    return { live: true, authenticated: true, database: health.database, user };
  } catch {
    return { live: false, authenticated: false };
  }
}

/** User shown in the sidebar — real account when live, placeholder otherwise. */
export async function getCurrentUser(): Promise<{ name: string; role: string; mode: string }> {
  const live = await ensureBackend();
  if (live) {
    try {
      const me = await fetchJson<{ username: string; role: string }>('/auth/me/');
      return { name: me.username, role: me.role, mode: 'authenticated' };
    } catch {
      /* fall through */
    }
  }
  return { name: 'Operator', role: 'Owner', mode: 'mock session' };
}

/* ------------------------------------------------------------------ */
/* Static status (used when the backend is offline)                    */
/* ------------------------------------------------------------------ */

export const BACKEND_STATUS = {
  api: {
    label: 'Backend API',
    state: 'not_connected' as const,
    detail: 'Django — start with: cd backend && python manage.py runserver',
  },
  data: {
    label: 'JSON / Data schema',
    state: 'mock' as const,
    detail: 'Mock JSON payloads — schema mapped for PostgreSQL',
  },
  database: {
    label: 'Database',
    state: 'not_connected' as const,
    detail: 'PostgreSQL — not connected yet',
  },
  endpoints: {
    label: 'API endpoints',
    state: 'pending' as const,
    detail: `${API_BASE_URL}/leads · /potential · /replies · /agents · /chat · /settings`,
  },
  auth: {
    label: 'Users / roles',
    state: 'mock' as const,
    detail: 'Mock session — planned roles: Owner, Admin, Member',
  },
} as const;

/* ------------------------------------------------------------------ */
/* Data access — live Django when available, mock data otherwise       */
/* ------------------------------------------------------------------ */

export async function getLeads(): Promise<Lead[]> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<Lead[]>('/leads/');
    } catch {
      /* fall back to mock */
    }
  }
  return MOCK_LEADS;
}

export async function getPotential(): Promise<Potential[]> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<Potential[]>('/potential/');
    } catch {
      /* fall back to mock */
    }
  }
  return MOCK_POTENTIAL;
}

export async function getReplies(): Promise<Reply[]> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<Reply[]>('/replies/');
    } catch {
      /* fall back to mock */
    }
  }
  return MOCK_REPLIES;
}

export function getAgents(): AgentMeta[] {
  return AGENTS; // static metas; live stats come via getAgentsLive()
}

export async function getAgentsLive(): Promise<AgentMeta[]> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<AgentMeta[]>('/agents/');
    } catch {
      /* fall back to static */
    }
  }
  return AGENTS;
}

/* ---------------- agents page ---------------- */

export async function getAgentConfig(agent: AgentKey): Promise<AgentConfig | null> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<AgentConfig>(`/agents/${agent}/config/`);
    } catch {
      return null;
    }
  }
  return null;
}

export async function putAgentConfig(agent: AgentKey, config: AgentConfig): Promise<boolean> {
  if (await ensureBackend()) {
    try {
      await fetchJson(`/agents/${agent}/config/`, {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/* ---------------- settings page ---------------- */

export async function getSettings(): Promise<SettingsState | null> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<SettingsState>('/settings/');
    } catch {
      return null;
    }
  }
  return null;
}

export async function putSettings(settings: SettingsState): Promise<boolean> {
  if (await ensureBackend()) {
    try {
      await fetchJson('/settings/', { method: 'PUT', body: JSON.stringify(settings) });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/* ---------------- email templates ---------------- */

export async function getTemplates(): Promise<EmailTemplate[] | null> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<EmailTemplate[]>('/templates/');
    } catch {
      return null;
    }
  }
  return null;
}

export async function createTemplate(tpl: Omit<EmailTemplate, 'id'>): Promise<EmailTemplate | null> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<EmailTemplate>('/templates/', { method: 'POST', body: JSON.stringify(tpl) });
    } catch {
      return null;
    }
  }
  return null;
}

export async function updateTemplate(id: string, tpl: Partial<EmailTemplate>): Promise<EmailTemplate | null> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<EmailTemplate>(`/templates/${id}/`, { method: 'PUT', body: JSON.stringify(tpl) });
    } catch {
      return null;
    }
  }
  return null;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  if (await ensureBackend()) {
    try {
      await fetchJson(`/templates/${id}/`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function changePassword(current: string, next: string, confirm: string): Promise<string | null> {
  if (await ensureBackend()) {
    try {
      await fetchJson('/auth/password/', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next, confirmPassword: confirm }),
      });
      return null; // success
    } catch (e) {
      return e instanceof Error ? e.message : 'password change failed';
    }
  }
  return null; // mock mode — handled by caller
}

/** Send the daily report right now — verifies the admin email + SMTP setup. */
export async function sendTestReport(): Promise<{
  status: 'smtp' | 'console' | 'skipped';
  recipients: string[];
} | null> {
  if (await ensureBackend()) {
    try {
      return await fetchJson('/report/test/', { method: 'POST', body: '{}' }, 60000);
    } catch {
      return null;
    }
  }
  return null;
}

/* ---------------- chat ---------------- */

export async function getChatHistory(): Promise<ChatMessage[] | null> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<ChatMessage[]>('/chat/');
    } catch {
      return null;
    }
  }
  return null;
}

export async function sendChatMessage(text: string): Promise<{ user?: ChatMessage; reply: ChatMessage }> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<{ userMessage: ChatMessage; reply: ChatMessage }>('/chat/', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }, 60000); // actions (approve/send, report) can take longer than the default probe timeout
    } catch {
      /* fall back to local mock */
    }
  }
  const reply: ChatMessage = {
    id: Date.now(),
    from: 'ai',
    text: mockResponderReply(text, text.length),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
  return { reply };
}

export async function clearChat(): Promise<boolean> {
  if (await ensureBackend()) {
    try {
      await fetchJson('/chat/', { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/* ---------------- leads & reports ---------------- */

export interface GeneratedReport {
  subject: string;
  text: string;
  html: string;
  emailed: boolean;
}

export async function generateReport(scope: 'today' | 'all', email = false): Promise<GeneratedReport | null> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<GeneratedReport>('/report/generate/', {
        method: 'POST',
        body: JSON.stringify({ scope, email }),
      }, 30000);
    } catch {
      return null;
    }
  }
  return null;
}

export async function downloadLeadsCsv(): Promise<boolean> {
  if (await ensureBackend()) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = `Token ${authToken}`;
      const res = await fetch(`${API_BASE_URL}/leads/export/`, { headers });
      if (!res.ok) return false;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/* ---------------- AI guide (in-product assistant) ---------------- */

export async function askGuide(text: string, history: { from: string; text: string }[] = []): Promise<string> {
  if (await ensureBackend()) {
    try {
      const r = await fetchJson<{ answer: string }>('/guide/', {
        method: 'POST',
        body: JSON.stringify({ text, history: history.slice(-8) }),
      }, 60000);
      return r.answer;
    } catch {
      /* fall back to the static tour below */
    }
  }
  return (
    'Quick tour: Pipeline → Run cycle discovers new leads. CRM → OUTREACH shows drafted ' +
    'cold emails — review, edit, then Approve & send. Settings configures your AI key, SMTP, ' +
    'email templates, the daily report and run frequency.'
  );
}

/* ---------------- outreach — cold-email drafts ---------------- */

export async function getDrafts(): Promise<EmailDraft[]> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<EmailDraft[]>('/drafts/');
    } catch {
      /* fall back to mock */
    }
  }
  return MOCK_DRAFTS;
}

export async function updateDraft(
  id: string | number,
  patch: { subject?: string; body?: string; toEmail?: string },
): Promise<boolean> {
  if (await ensureBackend()) {
    try {
      await fetchJson(`/drafts/${id}/`, { method: 'PUT', body: JSON.stringify(patch) });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Approve → the backend sends immediately (SMTP, or console when unset). */
export async function approveDraft(id: string | number): Promise<EmailDraft | null> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<EmailDraft>(`/drafts/${id}/approve/`, { method: 'POST', body: '{}' });
    } catch {
      return null;
    }
  }
  return null;
}

export async function rejectDraft(id: string | number): Promise<EmailDraft | null> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<EmailDraft>(`/drafts/${id}/reject/`, { method: 'POST', body: '{}' });
    } catch {
      return null;
    }
  }
  return null;
}

export async function sendDraft(id: string | number): Promise<EmailDraft | null> {
  if (await ensureBackend()) {
    try {
      return await fetchJson<EmailDraft>(`/drafts/${id}/send/`, { method: 'POST', body: '{}' });
    } catch {
      return null;
    }
  }
  return null;
}

/* ---------------- pipeline loop ---------------- */

export interface PipelineRunResult {
  id: number;
  notes: string[];
  leadsCreated: number;
  potentialsCreated: number;
  repliesCreated: number;
}

export async function runPipeline(): Promise<PipelineRunResult | null> {
  if (await ensureBackend()) {
    try {
      // a real cycle scrapes + audits up to 6 external sites — needs minutes, not seconds
      const data = await fetchJson<{
        id: number;
        leads_created: number;
        potentials_created: number;
        replies_created: number;
        summary: { notes: string[] };
      }>('/pipeline/run/', { method: 'POST', body: '{}' }, 300_000);
      return {
        id: data.id,
        notes: data.summary?.notes ?? [],
        leadsCreated: data.leads_created,
        potentialsCreated: data.potentials_created,
        repliesCreated: data.replies_created,
      };
    } catch {
      return null;
    }
  }
  return null;
}

export interface PipelineStatus {
  running: boolean;
  frequency: RunFrequency;
  nextRunInMinutes: number | null;
  lastRunNotes: string[];
}

export async function getPipelineStatus(): Promise<PipelineStatus | null> {
  if (await ensureBackend()) {
    try {
      const data = await fetchJson<{
        running: boolean;
        frequency: RunFrequency;
        nextRunInMinutes: number | null;
        lastRun: { summary: { notes: string[] } } | null;
      }>('/pipeline/status/');
      return {
        running: data.running,
        frequency: data.frequency,
        nextRunInMinutes: data.nextRunInMinutes,
        lastRunNotes: data.lastRun?.summary?.notes ?? [],
      };
    } catch {
      return null;
    }
  }
  return null;
}
