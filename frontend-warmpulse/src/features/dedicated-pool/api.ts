import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';

/**
 * Dedicated peer pool status for Agency/Enterprise workspaces.
 *
 * Read-only — admin assigns pools server-side. Lower tiers receive 402 from
 * the backend; we coerce that (and 404) to `null` so the component can render
 * "nothing assigned" or hide itself based on the plan gate.
 */
export interface DedicatedPoolStatus {
  is_dedicated: boolean;
  pool_id: string | null;
  pool_name: string | null;
  member_count: number;
  provider_mix: {
    gmail: number;
    outlook: number;
    yahoo: number;
    smtp: number;
  };
}

export function useDedicatedPoolStatus(): UseQueryResult<DedicatedPoolStatus | null> {
  return useQuery<DedicatedPoolStatus | null>({
    queryKey: ['workspace', 'dedicated-pool'],
    queryFn: async () => {
      try {
        const { data } = await api.get<DedicatedPoolStatus>(
          '/workspace/dedicated-pool',
        );
        return data;
      } catch (err) {
        if (err instanceof AxiosError) {
          const status = err.response?.status;
          // 402 = tier-gated (non-Agency); 404 = no assignment / endpoint missing.
          if (status === 402 || status === 404) return null;
        }
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}
