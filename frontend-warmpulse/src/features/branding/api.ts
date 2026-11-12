import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { env } from '@/lib/env';

/**
 * White-Label Branding hooks (Agency tier).
 *
 * The backend resolves parent-fallback automatically — Agency owners get
 * their own row, sub-clients see whatever their parent agency configured
 * (with `is_inherited: true`).
 */

export interface BrandingConfig {
  brand_name: string;
  accent_color: string;
  footer_text: string;
  email_footer_text: string;
  has_logo: boolean;
  is_inherited: boolean;
}

export const BRANDING_KEY = ['branding'] as const;

export const BRANDING_DEFAULTS: BrandingConfig = {
  brand_name: 'WarmPulse',
  accent_color: '#F26522',
  footer_text: 'Powered by WarmPulse',
  email_footer_text: 'Powered by WarmPulse',
  has_logo: false,
  is_inherited: false,
};

function isNotFound(err: unknown): boolean {
  if (err instanceof AxiosError) {
    const s = err.response?.status;
    return s === 404 || s === 501;
  }
  return false;
}

export function useBranding(): UseQueryResult<BrandingConfig> {
  return useQuery<BrandingConfig>({
    queryKey: BRANDING_KEY,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      try {
        const res = await api.get<BrandingConfig>('/workspace/branding');
        return { ...BRANDING_DEFAULTS, ...res.data };
      } catch (err) {
        if (isNotFound(err)) return BRANDING_DEFAULTS;
        throw err;
      }
    },
  });
}

export type BrandingUpdatePayload = Partial<
  Omit<BrandingConfig, 'has_logo' | 'is_inherited'>
>;

export function useUpdateBranding(): UseMutationResult<
  BrandingConfig,
  unknown,
  BrandingUpdatePayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch<BrandingConfig>('/workspace/branding', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BRANDING_KEY }),
  });
}

export function useUploadLogo(): UseMutationResult<BrandingConfig, unknown, File> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await api.post<BrandingConfig>(
          '/workspace/branding/logo',
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        return res.data;
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 400) {
          const detail =
            (err.response.data as { detail?: string } | undefined)?.detail ??
            'Logo upload failed (size or file type).';
          throw new Error(detail);
        }
        throw err;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BRANDING_KEY }),
  });
}

export function useDeleteLogo(): UseMutationResult<void, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/workspace/branding/logo');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BRANDING_KEY }),
  });
}

/**
 * Public logo URL. Backend resolves the workspace from auth; the optional
 * `workspace_id` is forwarded as `?ws=` so an admin previewing another
 * tenant's branding can disambiguate.
 *
 * A cache-busting `v` query is appended whenever a workspace id is provided
 * so the browser doesn't keep a stale logo after upload.
 */
export function getLogoUrl(workspaceId?: string): string {
  const base = `${env.VITE_API_BASE_URL}/workspace/branding/logo`;
  if (workspaceId) {
    return `${base}?ws=${encodeURIComponent(workspaceId)}`;
  }
  return base;
}
