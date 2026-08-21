import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';
import { api } from '@/lib/api';

/**
 * React-query hooks for the Julex store integration (spec: workspace →
 * integrations). One link per workspace: GET reports status, POST /verify
 * links a pk_live_… store key, DELETE unlinks. Mutations invalidate the
 * ['julex-link'] cache on success.
 */

export interface JulexLinkStatus {
  connected: boolean;
  store_key_masked: string | null;
  store_name: string | null;
  connected_at: string | null;
}

export const JULEX_LINK_KEY = ['julex-link'] as const;

export function useJulexLink(): UseQueryResult<JulexLinkStatus> {
  return useQuery({
    queryKey: JULEX_LINK_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const res: AxiosResponse<JulexLinkStatus> = await api.get(
        '/workspace/integrations/julex',
      );
      return res.data;
    },
  });
}

export interface VerifyJulexPayload {
  store_key: string;
}

export interface VerifyJulexResponse {
  connected: boolean;
  store_name: string;
}

/**
 * Link the workspace to a Julex store. The caller should map AxiosError
 * statuses inline: 404 → key rejected, 409 → already linked elsewhere,
 * 422 → key didn't look like a pk_live_… token.
 */
export function useVerifyJulex(): UseMutationResult<
  VerifyJulexResponse,
  unknown,
  VerifyJulexPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res: AxiosResponse<VerifyJulexResponse> = await api.post(
        '/workspace/integrations/julex/verify',
        payload,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: JULEX_LINK_KEY }),
  });
}

export function useDisconnectJulex(): UseMutationResult<void, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/workspace/integrations/julex');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: JULEX_LINK_KEY }),
  });
}

/** Human sentence for a failed verify call, keyed off the HTTP status. */
export function julexVerifyErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (status === 404) return 'Julex did not accept this key.';
    if (status === 409) return 'Already linked to another workspace.';
    if (status === 422) return 'Paste a key starting with pk_live_.';
    return detail ?? 'Could not verify this key. Try again.';
  }
  return 'Could not verify this key. Try again.';
}
