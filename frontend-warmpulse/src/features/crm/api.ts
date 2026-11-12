import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';
import { api } from '@/lib/api';
import type {
  AiDraftResponse,
  CreateActivityPayload,
  CreateCampaignPayload,
  CreateLeadPayload,
  CreateSequencePayload,
  CreateStepPayload,
  CreateTemplatePayload,
  CrmActivity,
  CrmCampaign,
  CrmCampaignAnalytics,
  CrmLead,
  CrmLimits,
  CrmMember,
  CrmRecentActivity,
  CrmSequence,
  CrmSequenceEnrollment,
  CrmSequenceStep,
  CrmSummary,
  CrmTemplate,
  EnrollLeadsPayload,
  EnrollResult,
  ImportLeadsPayload,
  ImportLeadsResult,
  UpdateCampaignPayload,
  UpdateLeadPayload,
  UpdateSequencePayload,
  UpdateStepPayload,
  UpdateTemplatePayload,
} from './types';

/**
 * TanStack Query hooks against the live `/api/crm/*` endpoints.
 *
 * Conventions mirror `features/billing/api.ts` and `features/mailboxes/api.ts`:
 *   - a single `crmKeys` query-key factory,
 *   - reads via `useQuery`, writes via `useMutation` with
 *     `onSuccess: qc.invalidateQueries(...)`,
 *   - the cap-limit 409 message is surfaced verbatim via `extractCrmError`
 *     so callers can `toast.error(extractCrmError(err))`.
 */

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const crmKeys = {
  all: ['crm'] as const,
  limits: () => [...crmKeys.all, 'limits'] as const,
  summary: () => [...crmKeys.all, 'summary'] as const,
  members: () => [...crmKeys.all, 'members'] as const,
  recentActivity: () => [...crmKeys.all, 'recent-activity'] as const,
  analytics: (campaignId: string) =>
    [...crmKeys.all, 'analytics', campaignId] as const,
  campaigns: () => [...crmKeys.all, 'campaigns'] as const,
  campaign: (id: string) => [...crmKeys.all, 'campaign', id] as const,
  leads: (campaignId: string) => [...crmKeys.all, 'leads', campaignId] as const,
  activities: (leadId: string) => [...crmKeys.all, 'activities', leadId] as const,
  sequences: (campaignId: string) =>
    [...crmKeys.all, 'sequences', campaignId] as const,
  sequence: (id: string) => [...crmKeys.all, 'sequence', id] as const,
  steps: (sequenceId: string) => [...crmKeys.all, 'steps', sequenceId] as const,
  enrollments: (sequenceId: string) =>
    [...crmKeys.all, 'enrollments', sequenceId] as const,
  templates: () => [...crmKeys.all, 'templates'] as const,
};

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

/**
 * Pull the human-readable error out of an axios failure. The backend returns
 * the cap-reached message (and other validation failures) in the FastAPI
 * `{ detail: "…" }` envelope; we surface that verbatim with a fallback.
 */
export function extractCrmError(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (data && typeof data === 'object') {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === 'string' && detail.trim().length > 0) return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        // FastAPI validation errors arrive as an array of {msg,...}.
        const first = detail[0] as { msg?: unknown } | undefined;
        if (first && typeof first.msg === 'string') return first.msg;
      }
      const message = (data as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) return message;
    }
    if (typeof data === 'string' && data.trim().length > 0) return data;
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// Limits + summary
// ---------------------------------------------------------------------------

export function useCrmLimits(): UseQueryResult<CrmLimits> {
  return useQuery({
    queryKey: crmKeys.limits(),
    staleTime: 60_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmLimits> = await api.get('/crm/limits');
      return res.data;
    },
  });
}

export function useCrmSummary(): UseQueryResult<CrmSummary> {
  return useQuery({
    queryKey: crmKeys.summary(),
    staleTime: 30_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmSummary> = await api.get('/crm/summary');
      return res.data;
    },
  });
}

/**
 * Assignable lead owners (workspace users + invited team members). Powers the
 * owner dropdown in the lead drawer and the owner filter on the board.
 */
export function useCrmMembers(): UseQueryResult<CrmMember[]> {
  return useQuery({
    queryKey: crmKeys.members(),
    staleTime: 60_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmMember[]> = await api.get('/crm/members');
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}

/**
 * Workspace-wide recent activity feed for the CRM landing. Newest first, capped
 * server-side. Returns `[]` on a non-array body so the tile never crashes.
 */
export function useCrmRecentActivity(): UseQueryResult<CrmRecentActivity[]> {
  return useQuery({
    queryKey: crmKeys.recentActivity(),
    staleTime: 20_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmRecentActivity[]> = await api.get('/crm/activity');
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}

/** Per-campaign analytics: conversion, open/reply rates, by-stage, by-owner. */
export function useCampaignAnalytics(
  campaignId: string | null | undefined,
): UseQueryResult<CrmCampaignAnalytics> {
  return useQuery({
    queryKey: crmKeys.analytics(campaignId ?? ''),
    enabled: !!campaignId,
    staleTime: 20_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmCampaignAnalytics> = await api.get(
        `/crm/campaigns/${campaignId}/analytics`,
      );
      return res.data;
    },
  });
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export function useCampaigns(): UseQueryResult<CrmCampaign[]> {
  return useQuery({
    queryKey: crmKeys.campaigns(),
    staleTime: 30_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmCampaign[]> = await api.get('/crm/campaigns');
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}

export function useCampaign(
  id: string | null | undefined,
): UseQueryResult<CrmCampaign> {
  return useQuery({
    queryKey: crmKeys.campaign(id ?? ''),
    enabled: !!id,
    staleTime: 30_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmCampaign> = await api.get(`/crm/campaigns/${id}`);
      return res.data;
    },
  });
}

/**
 * Create a campaign. The backend returns 409 with a human message when the
 * plan campaign cap is exceeded — let it throw so the caller can
 * `toast.error(extractCrmError(err))`.
 */
export function useCreateCampaign(): UseMutationResult<
  CrmCampaign,
  unknown,
  CreateCampaignPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res: AxiosResponse<CrmCampaign> = await api.post('/crm/campaigns', payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.campaigns() });
      qc.invalidateQueries({ queryKey: crmKeys.limits() });
      qc.invalidateQueries({ queryKey: crmKeys.summary() });
    },
  });
}

export function useUpdateCampaign(): UseMutationResult<
  CrmCampaign,
  unknown,
  { id: string; payload: UpdateCampaignPayload }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res: AxiosResponse<CrmCampaign> = await api.patch(
        `/crm/campaigns/${id}`,
        payload,
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.campaigns() });
      qc.invalidateQueries({ queryKey: crmKeys.campaign(vars.id) });
      qc.invalidateQueries({ queryKey: crmKeys.summary() });
    },
  });
}

export function useDeleteCampaign(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/crm/campaigns/${id}`);
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: crmKeys.campaigns() });
      qc.invalidateQueries({ queryKey: crmKeys.campaign(id) });
      qc.invalidateQueries({ queryKey: crmKeys.limits() });
      qc.invalidateQueries({ queryKey: crmKeys.summary() });
    },
  });
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export function useCampaignLeads(
  campaignId: string | null | undefined,
): UseQueryResult<CrmLead[]> {
  return useQuery({
    queryKey: crmKeys.leads(campaignId ?? ''),
    enabled: !!campaignId,
    staleTime: 15_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmLead[]> = await api.get(
        `/crm/campaigns/${campaignId}/leads`,
      );
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}

export function useCreateLead(): UseMutationResult<
  CrmLead,
  unknown,
  CreateLeadPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res: AxiosResponse<CrmLead> = await api.post('/crm/leads', payload);
      return res.data;
    },
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: crmKeys.leads(lead.campaign_id) });
      qc.invalidateQueries({ queryKey: crmKeys.campaigns() });
      qc.invalidateQueries({ queryKey: crmKeys.campaign(lead.campaign_id) });
      qc.invalidateQueries({ queryKey: crmKeys.summary() });
    },
  });
}

/**
 * Patch a lead. Used both for inline edits in the drawer and for the Kanban
 * stage drag / quick-move. Performs an optimistic update on the per-campaign
 * lead cache so the card moves columns instantly, rolling back on error.
 */
export function useUpdateLead(): UseMutationResult<
  CrmLead,
  unknown,
  { id: string; campaignId: string; payload: UpdateLeadPayload },
  { previous: CrmLead[] | undefined }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res: AxiosResponse<CrmLead> = await api.patch(`/crm/leads/${id}`, payload);
      return res.data;
    },
    onMutate: async ({ id, campaignId, payload }) => {
      const key = crmKeys.leads(campaignId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CrmLead[]>(key);
      if (previous) {
        qc.setQueryData<CrmLead[]>(
          key,
          previous.map((l) => (l.id === id ? { ...l, ...payload } : l)),
        );
      }
      return { previous };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(crmKeys.leads(vars.campaignId), ctx.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.leads(vars.campaignId) });
      qc.invalidateQueries({ queryKey: crmKeys.campaigns() });
      qc.invalidateQueries({ queryKey: crmKeys.campaign(vars.campaignId) });
      qc.invalidateQueries({ queryKey: crmKeys.summary() });
    },
  });
}

export function useDeleteLead(): UseMutationResult<
  void,
  unknown,
  { id: string; campaignId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => {
      await api.delete(`/crm/leads/${id}`);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.leads(vars.campaignId) });
      qc.invalidateQueries({ queryKey: crmKeys.campaigns() });
      qc.invalidateQueries({ queryKey: crmKeys.campaign(vars.campaignId) });
      qc.invalidateQueries({ queryKey: crmKeys.summary() });
    },
  });
}

export function useImportLeads(): UseMutationResult<
  ImportLeadsResult,
  unknown,
  ImportLeadsPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res: AxiosResponse<ImportLeadsResult> = await api.post(
        '/crm/leads/import',
        payload,
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.leads(vars.campaign_id) });
      qc.invalidateQueries({ queryKey: crmKeys.campaigns() });
      qc.invalidateQueries({ queryKey: crmKeys.campaign(vars.campaign_id) });
      qc.invalidateQueries({ queryKey: crmKeys.summary() });
    },
  });
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export function useLeadActivities(
  leadId: string | null | undefined,
): UseQueryResult<CrmActivity[]> {
  return useQuery({
    queryKey: crmKeys.activities(leadId ?? ''),
    enabled: !!leadId,
    staleTime: 15_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmActivity[]> = await api.get(
        `/crm/leads/${leadId}/activities`,
      );
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}

export function useAddActivity(): UseMutationResult<
  CrmActivity,
  unknown,
  { leadId: string; payload: CreateActivityPayload }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, payload }) => {
      const res: AxiosResponse<CrmActivity> = await api.post(
        `/crm/leads/${leadId}/activities`,
        payload,
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.activities(vars.leadId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

export function useSequences(
  campaignId: string | null | undefined,
): UseQueryResult<CrmSequence[]> {
  return useQuery({
    queryKey: crmKeys.sequences(campaignId ?? ''),
    enabled: !!campaignId,
    staleTime: 20_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmSequence[]> = await api.get('/crm/sequences', {
        params: { campaign_id: campaignId },
      });
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}

export function useCreateSequence(): UseMutationResult<
  CrmSequence,
  unknown,
  CreateSequencePayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res: AxiosResponse<CrmSequence> = await api.post('/crm/sequences', payload);
      return res.data;
    },
    onSuccess: (seq) => {
      qc.invalidateQueries({ queryKey: crmKeys.sequences(seq.campaign_id) });
    },
  });
}

export function useUpdateSequence(): UseMutationResult<
  CrmSequence,
  unknown,
  { id: string; campaignId: string; payload: UpdateSequencePayload }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res: AxiosResponse<CrmSequence> = await api.patch(
        `/crm/sequences/${id}`,
        payload,
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.sequences(vars.campaignId) });
      qc.invalidateQueries({ queryKey: crmKeys.sequence(vars.id) });
    },
  });
}

export function useDeleteSequence(): UseMutationResult<
  void,
  unknown,
  { id: string; campaignId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => {
      await api.delete(`/crm/sequences/${id}`);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.sequences(vars.campaignId) });
      qc.invalidateQueries({ queryKey: crmKeys.sequence(vars.id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Sequence steps
// ---------------------------------------------------------------------------

export function useSequenceSteps(
  sequenceId: string | null | undefined,
): UseQueryResult<CrmSequenceStep[]> {
  return useQuery({
    queryKey: crmKeys.steps(sequenceId ?? ''),
    enabled: !!sequenceId,
    staleTime: 15_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmSequenceStep[]> = await api.get(
        `/crm/sequences/${sequenceId}/steps`,
      );
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}

/**
 * Append (or insert) a step. We invalidate both the step list and the
 * parent sequence list so the card's `step_count` roll-up refreshes.
 */
export function useAddStep(): UseMutationResult<
  CrmSequenceStep,
  unknown,
  { sequenceId: string; campaignId: string; payload: CreateStepPayload }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sequenceId, payload }) => {
      const res: AxiosResponse<CrmSequenceStep> = await api.post(
        `/crm/sequences/${sequenceId}/steps`,
        payload,
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.steps(vars.sequenceId) });
      qc.invalidateQueries({ queryKey: crmKeys.sequences(vars.campaignId) });
    },
  });
}

export function useUpdateStep(): UseMutationResult<
  CrmSequenceStep,
  unknown,
  { id: string; sequenceId: string; payload: UpdateStepPayload }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res: AxiosResponse<CrmSequenceStep> = await api.patch(
        `/crm/sequence-steps/${id}`,
        payload,
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.steps(vars.sequenceId) });
    },
  });
}

export function useDeleteStep(): UseMutationResult<
  void,
  unknown,
  { id: string; sequenceId: string; campaignId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => {
      await api.delete(`/crm/sequence-steps/${id}`);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.steps(vars.sequenceId) });
      qc.invalidateQueries({ queryKey: crmKeys.sequences(vars.campaignId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------

export function useSequenceEnrollments(
  sequenceId: string | null | undefined,
): UseQueryResult<CrmSequenceEnrollment[]> {
  return useQuery({
    queryKey: crmKeys.enrollments(sequenceId ?? ''),
    enabled: !!sequenceId,
    staleTime: 15_000,
    queryFn: async () => {
      const res: AxiosResponse<CrmSequenceEnrollment[]> = await api.get(
        `/crm/sequences/${sequenceId}/enrollments`,
      );
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}

/**
 * Enroll selected leads. Invalidates the enrollment list plus the parent
 * sequence list so `active_enrollments` updates on the card.
 */
export function useEnrollLeads(): UseMutationResult<
  EnrollResult,
  unknown,
  { sequenceId: string; campaignId: string; payload: EnrollLeadsPayload }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sequenceId, payload }) => {
      const res: AxiosResponse<EnrollResult> = await api.post(
        `/crm/sequences/${sequenceId}/enroll`,
        payload,
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.enrollments(vars.sequenceId) });
      qc.invalidateQueries({ queryKey: crmKeys.sequences(vars.campaignId) });
    },
  });
}

export function useStopEnrollment(): UseMutationResult<
  void,
  unknown,
  { id: string; sequenceId: string; campaignId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => {
      await api.post(`/crm/enrollments/${id}/stop`);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: crmKeys.enrollments(vars.sequenceId) });
      qc.invalidateQueries({ queryKey: crmKeys.sequences(vars.campaignId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Email templates (sequence-step library)
// ---------------------------------------------------------------------------

/** Built-in library + this workspace's custom templates, built-ins first. */
export function useCrmTemplates(): UseQueryResult<CrmTemplate[]> {
  return useQuery({
    queryKey: crmKeys.templates(),
    queryFn: async () => {
      const res: AxiosResponse<CrmTemplate[]> = await api.get('/crm/templates');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateTemplate(): UseMutationResult<
  CrmTemplate,
  unknown,
  CreateTemplatePayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res: AxiosResponse<CrmTemplate> = await api.post(
        '/crm/templates',
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.templates() });
    },
  });
}

export function useUpdateTemplate(): UseMutationResult<
  CrmTemplate,
  unknown,
  { id: string; payload: UpdateTemplatePayload }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res: AxiosResponse<CrmTemplate> = await api.patch(
        `/crm/templates/${id}`,
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.templates() });
    },
  });
}

/**
 * Upload (or replace) the brand logo embedded in a template's emails.
 *
 * Sent as multipart/form-data. The Content-Type header is deliberately NOT
 * set — the browser must add it itself so it can append the multipart
 * boundary; setting it by hand produces a body the server cannot parse.
 */
export function useUploadTemplateLogo(): UseMutationResult<
  { has_logo: boolean; logo_url: string },
  unknown,
  { id: string; file: File }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }) => {
      const form = new FormData();
      form.append('file', file);
      const res: AxiosResponse<{ has_logo: boolean; logo_url: string }> =
        await api.post(`/crm/templates/${id}/logo`, form);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.templates() });
    },
  });
}

export function useDeleteTemplateLogo(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/crm/templates/${id}/logo`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.templates() });
    },
  });
}

/**
 * Download a ready-to-fill lead-import CSV.
 *
 * Fetched through the api client rather than a plain <a href> because the
 * endpoint is authenticated — a bare link sends no bearer token and would 401.
 * The blob URL is revoked immediately after the click to avoid leaking it.
 */
export async function downloadImportTemplate(source: 'csv' | 'linkedin'): Promise<void> {
  const res = await api.get(`/crm/leads/import-template?source=${source}`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `warmpulse-leads-${source}-template.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Create a template from an uploaded .eml export (subject + HTML body). */
export function useCreateTemplateFromEml(): UseMutationResult<
  CrmTemplate,
  unknown,
  File
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
      // Content-Type is intentionally unset so the browser adds the multipart
      // boundary itself.
      const res: AxiosResponse<CrmTemplate> = await api.post(
        '/crm/templates/from-eml',
        form,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.templates() });
    },
  });
}

export function useDeleteTemplate(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/crm/templates/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.templates() });
    },
  });
}

// ---------------------------------------------------------------------------
// AI draft (Generate-with-AI button in the step editor)
// ---------------------------------------------------------------------------

/** Draft a subject + body from a prompt via the configured LLM. The response's
 *  `generated=false` means no provider is configured server-side. */
export function useAiDraft(): UseMutationResult<AiDraftResponse, unknown, string> {
  return useMutation({
    mutationFn: async (prompt) => {
      const res: AxiosResponse<AiDraftResponse> = await api.post('/crm/ai/draft', {
        prompt,
      });
      return res.data;
    },
  });
}
