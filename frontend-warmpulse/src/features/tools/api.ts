/**
 * React-query hooks for the four Tools sub-pages.
 * All requests go through /workspace/tools/* (backed by
 * `/api/workspace/tools/*` on the backend).
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CreateTemplatePayload,
  EmailTemplate,
  GenerateTemplatePayload,
  GenerateTemplateResponse,
  PlacementTest,
  PlacementTestListResponse,
  PreviewHtmlPayload,
  PreviewHtmlResponse,
  RunPlacementTestPayload,
  RunSpamScanPayload,
  SpamScan,
  SpamScanListResponse,
  TemplateListResponse,
  UpdateTemplatePayload,
  WarmupPreviewPayload,
  WarmupPreviewResult,
} from './types';

const PLACEMENTS_KEY = ['tools', 'placements'] as const;
const SCANS_KEY = ['tools', 'spam-scans'] as const;
const TEMPLATES_KEY = ['tools', 'templates'] as const;

// --------------------------------------------------------------------------- //
// Placement Tester                                                            //
// --------------------------------------------------------------------------- //

export function useRunPlacementTest(): UseMutationResult<
  PlacementTest,
  unknown,
  RunPlacementTestPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post<PlacementTest>('/workspace/tools/placement', payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLACEMENTS_KEY });
    },
  });
}

export function usePlacementTests(): UseQueryResult<PlacementTestListResponse> {
  return useQuery({
    queryKey: PLACEMENTS_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get<PlacementTestListResponse>(
        '/workspace/tools/placement',
        { params: { page_size: 10 } },
      );
      return res.data;
    },
  });
}

// --------------------------------------------------------------------------- //
// Spam Scanner                                                                //
// --------------------------------------------------------------------------- //

export function useRunSpamScan(): UseMutationResult<SpamScan, unknown, RunSpamScanPayload> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post<SpamScan>('/workspace/tools/spam-scan', payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCANS_KEY });
    },
  });
}

export function useSpamScans(): UseQueryResult<SpamScanListResponse> {
  return useQuery({
    queryKey: SCANS_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get<SpamScanListResponse>('/workspace/tools/spam-scan', {
        params: { page_size: 10 },
      });
      return res.data;
    },
  });
}

// --------------------------------------------------------------------------- //
// Template Designer                                                           //
// --------------------------------------------------------------------------- //

export function useTemplates(): UseQueryResult<TemplateListResponse> {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get<TemplateListResponse>('/workspace/tools/templates');
      return res.data;
    },
  });
}

export function useCreateTemplate(): UseMutationResult<
  EmailTemplate,
  unknown,
  CreateTemplatePayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post<EmailTemplate>('/workspace/tools/templates', payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useUpdateTemplate(): UseMutationResult<
  EmailTemplate,
  unknown,
  { id: string; payload: UpdateTemplatePayload }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await api.patch<EmailTemplate>(
        `/workspace/tools/templates/${id}`,
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useDeleteTemplate(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      await api.delete(`/workspace/tools/templates/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
  });
}

export function useGenerateTemplate(): UseMutationResult<
  GenerateTemplateResponse,
  unknown,
  { id: string; payload: GenerateTemplatePayload }
> {
  return useMutation({
    mutationFn: async ({ id, payload }) => {
      const res = await api.post<GenerateTemplateResponse>(
        `/workspace/tools/templates/${id}/generate-llm`,
        payload,
      );
      return res.data;
    },
  });
}

export function useSanitizeHtml(): UseMutationResult<
  PreviewHtmlResponse,
  unknown,
  PreviewHtmlPayload
> {
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post<PreviewHtmlResponse>(
        '/workspace/tools/templates/preview',
        payload,
      );
      return res.data;
    },
  });
}

// --------------------------------------------------------------------------- //
// Warmup Preview                                                              //
// --------------------------------------------------------------------------- //

export function useWarmupPreview(): UseMutationResult<
  WarmupPreviewResult,
  unknown,
  WarmupPreviewPayload
> {
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post<WarmupPreviewResult>(
        '/workspace/tools/warmup-preview',
        payload,
      );
      return res.data;
    },
  });
}
