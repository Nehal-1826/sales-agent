/**
 * Placement Tester (Pro Plus) — react-query hooks against the new
 * `/workspace/placement-tests` endpoints.
 *
 * Distinct from the legacy `features/tools/api.ts` placement hooks (which
 * hit `/workspace/tools/placement` for the older synchronous tool). The new
 * endpoints model an asynchronous test that fans out to ~30 seed inboxes
 * and is polled while in-flight.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';

// --------------------------------------------------------------------------- //
// Types                                                                       //
// --------------------------------------------------------------------------- //

export type PlacementProvider = 'gmail' | 'outlook' | 'yahoo' | 'smtp';

export type PlacementTestStatus =
  | 'created'
  | 'sending'
  | 'polling'
  | 'running'
  | 'completed';

export interface ProviderBreakdown {
  inbox: number;
  promotions: number;
  spam: number;
  other: number;
  timeout: number;
}

export interface PlacementTestResults {
  inbox: number;
  promotions: number;
  spam: number;
  other: number;
  timeout: number;
  total_seeds: number;
  by_provider: Record<PlacementProvider, ProviderBreakdown>;
}

export interface PlacementSeed {
  id: string;
  provider?: PlacementProvider | null;
  status: string;
  landed_folder?: string | null;
}

export interface PlacementTest {
  id: string;
  mailbox_id: string;
  status: PlacementTestStatus;
  created_at: string;
  completed_at: string | null;
  seed_count: number;
  seeds_resolved: number;
  results: PlacementTestResults | null;
  seeds?: PlacementSeed[];
  mailbox_email?: string | null;
}

export interface PlacementTestListItem {
  id: string;
  mailbox_id: string;
  mailbox_email?: string | null;
  status: PlacementTestStatus;
  created_at: string;
  completed_at: string | null;
  seed_count: number;
  seeds_resolved: number;
  results: PlacementTestResults | null;
}

export interface PlacementTestListResponse {
  items: PlacementTestListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface StartPlacementTestPayload {
  mailbox_id: string;
}

export interface StartPlacementTestResponse {
  test_id: string;
  seed_count: number;
  status: PlacementTestStatus;
}

// --------------------------------------------------------------------------- //
// Errors                                                                      //
// --------------------------------------------------------------------------- //

/** Thrown by `useStartPlacementTest` when the backend returns 402. */
export class PlacementQuotaExceededError extends Error {
  readonly quotaExceeded = true;
  constructor(message = 'quota_exceeded') {
    super(message);
    this.name = 'PlacementQuotaExceededError';
  }
}

export function isQuotaExceededError(err: unknown): err is PlacementQuotaExceededError {
  return (
    err instanceof PlacementQuotaExceededError ||
    (err instanceof Error && (err as { quotaExceeded?: boolean }).quotaExceeded === true)
  );
}

// --------------------------------------------------------------------------- //
// Keys                                                                        //
// --------------------------------------------------------------------------- //

export const PLACEMENT_TESTS_KEY = ['placement-tests'] as const;

// --------------------------------------------------------------------------- //
// Hooks                                                                       //
// --------------------------------------------------------------------------- //

export function useStartPlacementTest(): UseMutationResult<
  StartPlacementTestResponse,
  Error,
  StartPlacementTestPayload
> {
  const qc = useQueryClient();
  return useMutation<StartPlacementTestResponse, Error, StartPlacementTestPayload>({
    mutationFn: async (payload) => {
      try {
        const res = await api.post<StartPlacementTestResponse>(
          '/workspace/placement-tests',
          payload,
        );
        return res.data;
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 402) {
          throw new PlacementQuotaExceededError();
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLACEMENT_TESTS_KEY });
    },
  });
}

/**
 * Polls a single placement test. While `status !== 'completed'` the query
 * refetches every 5s; once completed polling stops.
 */
export function usePlacementTest(
  testId: string | null,
): UseQueryResult<PlacementTest> {
  return useQuery<PlacementTest>({
    queryKey: [...PLACEMENT_TESTS_KEY, testId],
    enabled: !!testId,
    refetchInterval: (query) => {
      const data = query.state.data as PlacementTest | undefined;
      if (!data) return 5_000;
      return data.status !== 'completed' ? 5_000 : false;
    },
    queryFn: async () => {
      const res = await api.get<PlacementTest>(
        `/workspace/placement-tests/${testId}`,
      );
      return res.data;
    },
  });
}

export interface PlacementHistoryParams {
  limit?: number;
  offset?: number;
}

export function usePlacementTestHistory(
  params?: PlacementHistoryParams,
): UseQueryResult<PlacementTestListResponse> {
  const limit = params?.limit ?? 20;
  const offset = params?.offset ?? 0;
  return useQuery<PlacementTestListResponse>({
    queryKey: [...PLACEMENT_TESTS_KEY, 'history', { limit, offset }],
    staleTime: 30_000,
    queryFn: async () => {
      try {
        const res = await api.get<PlacementTestListResponse>(
          '/workspace/placement-tests',
          { params: { limit, offset } },
        );
        return res.data;
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 404) {
          return { items: [], total: 0, limit, offset };
        }
        throw err;
      }
    },
  });
}
