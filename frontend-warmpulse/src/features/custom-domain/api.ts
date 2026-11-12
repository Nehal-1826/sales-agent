import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';

/**
 * Custom Domain hooks (Agency tier).
 *
 * Agency users can serve their client portal from their own hostname
 * (e.g. `clients.youragency.com`). The backend issues a verification
 * token; this UI walks them through publishing a TXT or CNAME record
 * and polls the verify endpoint until it succeeds.
 */

export type CustomDomainStatus = 'pending' | 'verified' | 'failed';

export interface CustomDomain {
  id: string;
  domain: string;
  status: CustomDomainStatus;
  verification_code: string;
  verification_method: 'TXT' | 'CNAME' | null;
  verified_at: string | null;
  last_check_at: string | null;
  last_check_error: string | null;
}

export const CUSTOM_DOMAIN_KEY = ['custom-domain'] as const;

/**
 * Typed errors thrown by `useStartCustomDomain` so the form can render
 * specific inline copy for the most common backend rejections.
 */
export type StartCustomDomainErrorCode =
  | 'invalid_format'
  | 'duplicate'
  | 'plan_required'
  | 'unknown';

export class StartCustomDomainError extends Error {
  code: StartCustomDomainErrorCode;
  status: number | undefined;

  constructor(code: StartCustomDomainErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'StartCustomDomainError';
    this.code = code;
    this.status = status;
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 404;
}

export function useCustomDomain(): UseQueryResult<CustomDomain | null> {
  return useQuery<CustomDomain | null>({
    queryKey: CUSTOM_DOMAIN_KEY,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data as CustomDomain | null | undefined;
      return data?.status === 'pending' ? 30_000 : false;
    },
    queryFn: async () => {
      try {
        const res = await api.get<CustomDomain>('/workspace/custom-domain');
        return res.data;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
  });
}

export interface StartCustomDomainPayload {
  domain: string;
}

export function useStartCustomDomain(): UseMutationResult<
  CustomDomain,
  StartCustomDomainError,
  StartCustomDomainPayload
> {
  const qc = useQueryClient();
  return useMutation<CustomDomain, StartCustomDomainError, StartCustomDomainPayload>({
    mutationFn: async (payload) => {
      try {
        const res = await api.post<CustomDomain>(
          '/workspace/custom-domain',
          payload,
        );
        return res.data;
      } catch (err) {
        if (err instanceof AxiosError && err.response) {
          const status = err.response.status;
          const detail =
            (err.response.data as { detail?: string } | undefined)?.detail;
          if (status === 400) {
            throw new StartCustomDomainError(
              'invalid_format',
              detail ?? 'Invalid domain format.',
              status,
            );
          }
          if (status === 402) {
            throw new StartCustomDomainError(
              'plan_required',
              detail ?? 'Agency tier required.',
              status,
            );
          }
          if (status === 409) {
            throw new StartCustomDomainError(
              'duplicate',
              detail ??
                'That domain is already registered to another workspace.',
              status,
            );
          }
          throw new StartCustomDomainError(
            'unknown',
            detail ?? 'Failed to register custom domain.',
            status,
          );
        }
        throw new StartCustomDomainError('unknown', 'Network error.');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOM_DOMAIN_KEY }),
  });
}

export function useVerifyCustomDomain(): UseMutationResult<
  CustomDomain,
  unknown,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<CustomDomain>(
        '/workspace/custom-domain/verify',
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOM_DOMAIN_KEY }),
  });
}

export function useRemoveCustomDomain(): UseMutationResult<void, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/workspace/custom-domain');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CUSTOM_DOMAIN_KEY }),
  });
}
